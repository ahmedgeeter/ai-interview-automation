import os
import base64
import re
import asyncio
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Tuple, List
import io
import httpx
import edge_tts
from gtts import gTTS
from dotenv import load_dotenv

load_dotenv()

# Shared persistent HTTP client with HTTP/2 and connection pooling for minimal latency
_http_client: httpx.AsyncClient | None = None

def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            http2=True,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=50, keepalive_expiry=60.0),
            timeout=httpx.Timeout(12.0, connect=4.0)
        )
    return _http_client

class BaseTTSProvider(ABC):
    @abstractmethod
    async def generate_audio_stream(self, text: str, voice: str) -> AsyncGenerator[bytes, None]:
        """Yields audio chunks as bytes"""
        pass

    @abstractmethod
    async def generate_full_audio(self, text: str, voice: str) -> bytes:
        """Returns the complete audio bytes"""
        pass

class ElevenLabsProvider(BaseTTSProvider):
    # Class-level shared active key index so rotation persists across calls and chunks
    _shared_key_idx = 0

    def __init__(self):
        self.keys: List[str] = []
        primary = os.getenv("ELEVENLABS_API_KEY", "").strip()
        if primary:
            self.keys.append(primary)
        fallback = os.getenv("ELEVENLABS_API_KEY_FALLBACK", "").strip()
        if fallback and fallback not in self.keys:
            self.keys.append(fallback)
        self.model_id = os.getenv("ELEVENLABS_MODEL_ID", "eleven_turbo_v2_5")

    def _get_current_key(self) -> str | None:
        if not self.keys:
            return None
        return self.keys[ElevenLabsProvider._shared_key_idx % len(self.keys)]

    def _rotate_key(self):
        if len(self.keys) > 1:
            ElevenLabsProvider._shared_key_idx = (ElevenLabsProvider._shared_key_idx + 1) % len(self.keys)
            print(f"[ElevenLabsProvider] Rotated to key index: {ElevenLabsProvider._shared_key_idx}")

    def _get_voice_id(self, language: str) -> str:
        if language in ("ar-eg", "ar"):
            # George (JBFqnCBsd6RMkjVDRZzb): Articulate, deep, authoritative Arabic Tech Lead
            return os.getenv("ELEVENLABS_ARABIC_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")
        # Charlie: Deep, confident energetic English (Turbo EN in UI)
        return os.getenv("ELEVENLABS_VOICE_ID", "IKne3meq5aSn9XLyUdCD")

    async def generate_audio_stream(self, text: str, voice: str) -> AsyncGenerator[bytes, None]:
        audio_data = await self.generate_full_audio(text, voice)
        yield audio_data

    async def generate_full_audio(self, text: str, voice: str) -> bytes:
        if not self.keys:
            raise ValueError("No ElevenLabs API key configured")
        
        voice_id = self._get_voice_id(voice)
        # optimize_streaming_latency=3 cuts audio latency to sub-250ms
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?optimize_streaming_latency=3"
        
        if voice in ("ar-eg", "ar"):
            models_to_try = ["eleven_multilingual_v2", "eleven_flash_v2_5"]
        else:
            models_to_try = [self.model_id]
            if self.model_id != "eleven_multilingual_v2":
                models_to_try.append("eleven_multilingual_v2")

        client = get_http_client()
        attempts = max(1, len(self.keys))

        for attempt in range(attempts):
            api_key = self._get_current_key()
            if not api_key:
                break
                
            headers = {
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": api_key
            }

            for current_model in models_to_try:
                data = {
                    "text": text,
                    "model_id": current_model,
                    "voice_settings": {
                        "stability": 0.45,
                        "similarity_boost": 0.80,
                        "style": 0.05,
                        "use_speaker_boost": True
                    }
                }

                try:
                    response = await client.post(url, json=data, headers=headers)
                    if response.status_code == 200:
                        return response.content
                    elif response.status_code in (401, 429):
                        print(f"[ElevenLabsProvider] Auth/Quota rate limit ({response.status_code}) on key. Rotating...")
                        self._rotate_key()
                        break # Break model loop to try the rotated key
                    elif response.status_code == 400 and current_model != "eleven_multilingual_v2":
                        print(f"[ElevenLabsProvider] Model {current_model} returned 400, falling back to multilingual_v2...")
                        continue
                    else:
                        print(f"[ElevenLabsProvider] Error {response.status_code}: {response.text[:200]}")
                        break
                except httpx.RequestError as req_err:
                    print(f"[ElevenLabsProvider] Network request error: {req_err}")
                    break
        
        raise Exception("All ElevenLabs API keys failed, quota exceeded, or service unreachable.")

class EdgeTTSProvider(BaseTTSProvider):
    async def generate_audio_stream(self, text: str, voice: str) -> AsyncGenerator[bytes, None]:
        try:
            communicate = edge_tts.Communicate(text, voice)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]
        except Exception as e:
            print(f"[EdgeTTSProvider] Error generating stream: {e}")
            raise

    async def generate_full_audio(self, text: str, voice: str) -> bytes:
        audio_data = b""
        try:
            communicate = edge_tts.Communicate(text, voice)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data += chunk["data"]
        except Exception as e:
            print(f"[EdgeTTSProvider] Error generating full audio: {e}")
            raise
        return audio_data

class FallbackTTSProvider(BaseTTSProvider):
    async def generate_audio_stream(self, text: str, voice: str) -> AsyncGenerator[bytes, None]:
        audio = await self.generate_full_audio(text, voice)
        yield audio

    async def generate_full_audio(self, text: str, voice: str) -> bytes:
        try:
            lang = "ar" if "ar" in voice.lower() else "en"
            fp = io.BytesIO()
            def generate():
                tts = gTTS(text=text, lang=lang, slow=False)
                tts.write_to_fp(fp)
            await asyncio.to_thread(generate)
            fp.seek(0)
            return fp.read()
        except Exception as e:
            print(f"[FallbackTTSProvider] Error: {e}")
            return b""

# Comprehensive Egyptian Colloquial Arabic phonetic mapping
# Ensures natural intonation and prevents mispronunciations of technical conversational Egyptian
EGYPTIAN_PHONETIC_MAP = {
    r"\bعلشان\b": "عَلَشَانْ",
    r"\bإزيك\b": "إِزَّيَّكْ",
    r"\bازيك\b": "إِزَّيَّكْ",
    r"\bإزاي\b": "إِزَّايْ",
    r"\bازاي\b": "إِزَّايْ",
    r"\bكده\b": "كِدَه",
    r"\bإيه\b": "إِيه",
    r"\bايه\b": "إِيه",
    r"\bالنهاردة\b": "النَّهَارْدَه",
    r"\bعايز\b": "عَايِزْ",
    r"\bعايزك\b": "عَايْزَكْ",
    r"\bعايزة\b": "عَايْزَة",
    r"\bمش\b": "مِشْ",
    r"\bدلوقتي\b": "دِلْوَقْتِي",
    r"\bفين\b": "فِينْ",
    r"\bليه\b": "لِيهْ",
    r"\bشوية\b": "شِوَيَّة",
    r"\bيلا\b": "يَلَّا",
    r"\bبرضه\b": "بَرْضُه",
    r"\bبرضو\b": "بَرْضُه",
    r"\bكتير\b": "كِتِيرْ",
    r"\bقوي\b": "قَوِي",
    r"\bطيب\b": "طَيِّبْ",
    r"\bطَب\b": "طَبْ",
    r"\bطب\b": "طَبْ",
    r"\bأهلاً\b": "أَهْلًا",
    r"\bاهلا\b": "أَهْلًا",
    r"\bمعانا\b": "مَعَانَا",
    r"\bنبدا\b": "نِبْدَأْ",
    r"\bنبدأ\b": "نِبْدَأْ",
    r"\bشايف\b": "شَايِفْ",
    r"\bشايفها\b": "شَايِفْهَا",
    r"\bشايفين\b": "شَايِفِينْ",
    r"\bتقدر\b": "تِقْدَرْ",
    r"\bهتعمل\b": "هَتِعْمِلْ",
    r"\bهتستخدم\b": "هَتِسْتَخْدِمْ",
    r"\bهنعمل\b": "هَنِعْمِلْ",
    r"\bقولي\b": "قُولِّي",
    r"\bقولنا\b": "قُولَّنَا",
    r"\bباشمهندس\b": "بَشْمُهَنْدِسْ",
    r"\bبشمهندس\b": "بَشْمُهَنْدِسْ",
    r"\bتمام\b": "تَمَامْ",
    r"\bممكن\b": "مُمْكِنْ",
    r"\bسؤال\b": "سُؤَالْ",
    r"\bإنترفيو\b": "إِنْتَرْفْيُو",
    r"\bانترفيو\b": "إِنْتَرْفْيُو",
    r"\bكويسة\b": "كُوَيِّسَة",
    r"\bكويس\b": "كُوَيِّسْ",
    r"\bبص\b": "بُصّ",
    r"\bمعلش\b": "مَعْلِشّ",
    r"\bحاجة\b": "حَاجَة",
    r"\bحاجات\b": "حَاجَاتْ",
    r"\bتاني\b": "تَانِي",
    r"\bتانية\b": "تَانْيَة",
    r"\bشغال\b": "شَغَّالْ",
    r"\bشغالة\b": "شَغَّالَة",
    r"\bزي\b": "زَيّ",
}

def apply_phonetic_middleware(text: str, language: str) -> str:
    """
    Decoupled phonetic middleware: injects localized diacritics into the audio text payload
    without altering the clean transcript displayed in the chat UI.
    """
    if language not in ("ar-eg", "ar"):
        return text
    
    processed = text
    if language == "ar-eg":
        for pattern, replacement in EGYPTIAN_PHONETIC_MAP.items():
            processed = re.sub(pattern, replacement, processed)
    return processed

def get_voice_for_language(language: str) -> str:
    if language == "ar-eg":
        return "ar-EG-ShakirNeural"  # Authentic Egyptian Male Tech Lead
    elif language == "ar":
        return "ar-SA-HamedNeural"   # Professional Standard Arabic Male
    return "en-US-ChristopherNeural"

def split_into_sentences(text: str) -> list[str]:
    # Split on standard punctuation or newlines while keeping readable chunks
    sentences = re.split(r'(?<=[.!?؟\n])\s+', text.strip())
    return [s for s in sentences if s.strip()]

# Cached singleton providers for optimal memory & socket reuse
_eleven_provider = ElevenLabsProvider()
_edge_provider = EdgeTTSProvider()
_fallback_provider = FallbackTTSProvider()

async def generate_audio_chunks_from_text(text: str, language: str = "en") -> AsyncGenerator[str, None]:
    """
    Splits text into sentences, applies phonetic middleware, generates audio using Strategy Pattern,
    and yields base64 encoded chunks with sub-300ms responsiveness.
    """
    if not text or not text.strip():
        return
        
    voice = get_voice_for_language(language)
    sentences = split_into_sentences(text)
    
    for sentence in sentences:
        audio_payload_text = apply_phonetic_middleware(sentence, language)
        audio_bytes = None
        try:
            audio_bytes = await asyncio.wait_for(
                _eleven_provider.generate_full_audio(audio_payload_text, language),
                timeout=4.5
            )
        except Exception as e:
            print(f"[TTS] ElevenLabs bypassed or timed out ({e}). Utilizing native neural voice ({voice})...")
            try:
                audio_bytes = await asyncio.wait_for(
                    _edge_provider.generate_full_audio(audio_payload_text, voice),
                    timeout=5.0
                )
            except Exception as e2:
                print(f"[TTS] EdgeTTS failed ({e2}). Trying Fallback gTTS...")
                audio_bytes = await _fallback_provider.generate_full_audio(audio_payload_text, voice)
            
        if audio_bytes:
            yield base64.b64encode(audio_bytes).decode("utf-8")

async def generate_full_audio_from_text(text: str, language: str = "en") -> Tuple[str, int]:
    """
    Legacy method for full audio generation, maintaining the same signature for backwards compatibility
    where chunking is not used (e.g. warning messages).
    """
    if not text or not text.strip():
        return "", 0
        
    voice = get_voice_for_language(language)
    audio_payload_text = apply_phonetic_middleware(text, language)
    audio_bytes = None
    try:
        audio_bytes = await asyncio.wait_for(
            _eleven_provider.generate_full_audio(audio_payload_text, language),
            timeout=5.0
        )
    except Exception as e:
        print(f"[TTS] ElevenLabs bypassed ({e}). Utilizing native neural voice ({voice})...")
        try:
            audio_bytes = await asyncio.wait_for(
                _edge_provider.generate_full_audio(audio_payload_text, voice),
                timeout=5.0
            )
        except Exception as e2:
            print(f"[TTS] EdgeTTS failed: {e2}. Trying Fallback gTTS...")
            audio_bytes = await _fallback_provider.generate_full_audio(audio_payload_text, voice)
        
    if audio_bytes:
        return base64.b64encode(audio_bytes).decode("utf-8"), len(text)
    return "", 0
