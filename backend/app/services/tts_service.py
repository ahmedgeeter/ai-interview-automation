import os
import base64
import re
import asyncio
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Tuple, List, Dict, Any
import httpx
import edge_tts
from dotenv import load_dotenv

load_dotenv()

# Authentic Egyptian Voice IDs on ElevenLabs (Trained on native Masri dialect)
# 68MRVrnQAt8vLbu0FCzw: Mamdoh (ممدوح - صوت مصري أصيل طبيعي وواقعي جداً)
# jsCqWAovK2zikIGpzIma: Tarek (طارق - قائد تقني مصري)
DEFAULT_EGYPTIAN_VOICE_ID = os.getenv("ELEVENLABS_EGYPTIAN_VOICE_ID", "68MRVrnQAt8vLbu0FCzw")
DEFAULT_STANDARD_AR_VOICE_ID = os.getenv("ELEVENLABS_ARABIC_VOICE_ID", "jsCqWAovK2zikIGpzIma")
DEFAULT_ENGLISH_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "IKne3meq5aSn9XLyUdCD")

# High-fidelity male Tech Lead voice profiles for Edge-TTS fallback
# Ensuring strictly consistent male gender across all fallbacks (zero switching to female)
VOICE_PROFILES: Dict[str, Dict[str, Any]] = {
    "ar-eg": {
        "primary": "ar-SA-HamedNeural",       # Hamed is the highest quality, most natural male Arabic voice in Edge-TTS
        "fallbacks": ["ar-EG-ShakirNeural", "ar-AE-HamdanNeural"],
        "rate": "+4%",
        "pitch": "+0Hz",
        "label": "ممدوح (مصري أصيل ElevenLabs) / حامد (عربي رزين)"
    },
    "ar": {
        "primary": "ar-SA-HamedNeural",
        "fallbacks": ["ar-EG-ShakirNeural", "ar-AE-HamdanNeural"],
        "rate": "+4%",
        "pitch": "+0Hz",
        "label": "حامد (قائد تقني عربي)"
    },
    "en": {
        "primary": "en-US-BrianNeural",
        "fallbacks": ["en-US-ChristopherNeural", "en-US-AndrewMultilingualNeural"],
        "rate": "+4%",
        "pitch": "+0Hz",
        "label": "Brian (Senior US Tech Lead)"
    }
}

# Shared persistent HTTP client with HTTP/2 and connection pooling for minimal latency
_http_client: httpx.AsyncClient | None = None

def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            http2=True,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=50, keepalive_expiry=60.0),
            timeout=httpx.Timeout(8.0, connect=2.5)
        )
    return _http_client

class BaseTTSProvider(ABC):
    @abstractmethod
    async def generate_full_audio(self, text: str, voice: str, rate: str = "+0%", pitch: str = "+0Hz") -> bytes:
        pass

class ElevenLabsProvider:
    def __init__(self):
        self.keys: List[str] = []
        primary = os.getenv("ELEVENLABS_API_KEY", "").strip()
        if primary:
            self.keys.append(primary)
        fallback = os.getenv("ELEVENLABS_API_KEY_FALLBACK", "").strip()
        if fallback and fallback not in self.keys:
            self.keys.append(fallback)
        self.current_key_idx = 0

    def is_configured(self) -> bool:
        return len(self.keys) > 0

    def _get_current_key(self) -> str | None:
        if not self.keys:
            return None
        return self.keys[self.current_key_idx % len(self.keys)]

    def _rotate_key(self):
        if len(self.keys) > 1:
            self.current_key_idx = (self.current_key_idx + 1) % len(self.keys)

    def _get_voice_id(self, language: str) -> str:
        if language == "ar-eg":
            return DEFAULT_EGYPTIAN_VOICE_ID
        elif language == "ar":
            return DEFAULT_STANDARD_AR_VOICE_ID
        return DEFAULT_ENGLISH_VOICE_ID

    async def generate_full_audio(self, text: str, language: str) -> bytes:
        if not self.keys:
            raise ValueError("No ElevenLabs API key configured")

        voice_id = self._get_voice_id(language)
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?optimize_streaming_latency=3"
        client = get_http_client()
        models = ["eleven_flash_v2_5", "eleven_multilingual_v2"]

        for _ in range(max(1, len(self.keys))):
            api_key = self._get_current_key()
            if not api_key:
                break
            headers = {
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": api_key
            }
            for model in models:
                data = {
                    "text": text,
                    "model_id": model,
                    "voice_settings": {
                        "stability": 0.45,
                        "similarity_boost": 0.85,
                        "style": 0.15,
                        "use_speaker_boost": True
                    }
                }
                try:
                    res = await client.post(url, json=data, headers=headers)
                    if res.status_code == 200:
                        return res.content
                    elif res.status_code in (401, 429):
                        self._rotate_key()
                        break
                    elif res.status_code == 400:
                        continue
                except Exception:
                    break

        raise Exception("ElevenLabs generation failed or quota exceeded")

class EdgeTTSProvider(BaseTTSProvider):
    async def generate_full_audio(self, text: str, voice: str, rate: str = "+0%", pitch: str = "+0Hz") -> bytes:
        audio_data = b""
        try:
            communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data += chunk["data"]
        except Exception as e:
            print(f"[EdgeTTSProvider] Error with voice {voice}: {e}")
            raise
        return audio_data

# Egyptian Colloquial Arabic phonetic mapping
EGYPTIAN_PHONETIC_MAP = {
    r"\bعلشان\b": "علشان",
    r"\bإزيك\b": "إزيك",
    r"\bإزاي\b": "إزاي",
    r"\bكده\b": "كده",
    r"\bالنهاردة\b": "النهاردة",
    r"\bدلوقتي\b": "دلوقتي",
    r"\bأهلاً\b": "أهلاً",
    r"\bتمام\b": "تَمَامْ",
    r"\bبص\b": "بُصّ",
    r"\bكويس\b": "كويس",
    r"\bشغال\b": "شَغَّالْ",
}

# Technical term phonetic helpers for smooth conversational Arabic delivery
TECH_PHONETIC_REPLACEMENTS = [
    (r"\bAPI\b", "إيه بي آي"),
    (r"\bAPIs\b", "إيه بي آيز"),
    (r"\bP99\b", "بي 99"),
    (r"\bP95\b", "بي 95"),
    (r"\bCI/CD\b", "سي آي سي دي"),
    (r"\bSQL\b", "إس كيو إل"),
    (r"\bNoSQL\b", "نو إس كيو إل"),
    (r"\bDeadlock\b", "ديد لوك"),
    (r"\bMicroservices\b", "مايكروسيرفسز"),
    (r"\bMonolith\b", "مونوليث"),
    (r"\bCache\b", "كاش"),
    (r"\bBottlenecks\b", "بوتل نيكس"),
    (r"\bConcurrency\b", "كونكورنسي"),
    (r"\bCircuit Breaker\b", "سيركت بريكر"),
]

def apply_phonetic_middleware(text: str, language: str) -> str:
    """
    Cleans up text for natural human pronunciation.
    Ensures technical acronyms flow naturally in Arabic without jarring phonetic artifacts.
    """
    if not text:
        return ""
        
    processed = text
    if language == "ar-eg":
        for pattern, replacement in EGYPTIAN_PHONETIC_MAP.items():
            processed = re.sub(pattern, replacement, processed)

    if language in ("ar-eg", "ar"):
        for pattern, replacement in TECH_PHONETIC_REPLACEMENTS:
            processed = re.sub(pattern, replacement, processed, flags=re.IGNORECASE)
        # Clean any stray markdown formatting characters that TTS might enunciate
        processed = re.sub(r'[*_#`]', '', processed)
        
    return processed

def split_into_speech_chunks(text: str) -> List[str]:
    """
    Intelligent speech chunker designed for sub-300ms time-to-first-audio.
    Splits the opening greeting/clause fast (at early pause) so the candidate
    hears the interviewer speak immediately, while the rest synthesizes concurrently.
    """
    cleaned = text.strip()
    if not cleaned:
        return []

    # First, split by full stops / question marks / newlines
    raw_sentences = re.split(r'(?<=[.!?؟\n])\s+', cleaned)
    chunks = []

    for idx, sentence in enumerate(raw_sentences):
        sentence = sentence.strip()
        if not sentence:
            continue
            
        # For the FIRST sentence, if it's longer than 40 chars, split on early comma/pause
        # so Chunk 1 begins streaming to the user in ~200ms!
        if idx == 0 and len(sentence) > 40:
            match = re.search(r'([،,:]|(\s*-\s*))\s*', sentence)
            if match and 15 <= match.start() <= 65:
                split_pos = match.end()
                part1 = sentence[:split_pos].strip()
                part2 = sentence[split_pos:].strip()
                if part1:
                    chunks.append(part1)
                if part2:
                    chunks.append(part2)
                continue

        # If any sentence is longer than 130 chars, split on secondary punctuation
        if len(sentence) > 130:
            parts = re.split(r'(?<=[،,;:])\s+', sentence)
            buf = ""
            for p in parts:
                if len(buf) + len(p) < 120:
                    buf = (buf + " " + p).strip()
                else:
                    if buf:
                        chunks.append(buf)
                    buf = p
            if buffer if (buffer := buf) else "":
                chunks.append(buffer)
        else:
            chunks.append(sentence)

    return [c for c in chunks if c.strip()]

# Cached singleton providers
_eleven_provider = ElevenLabsProvider()
_edge_provider = EdgeTTSProvider()

async def generate_audio_chunks_from_text(text: str, language: str = "en") -> AsyncGenerator[str, None]:
    """
    Splits text into low-latency chunks, synthesizes using authentic ElevenLabs models when configured,
    with instant fallback to high-fidelity Microsoft Azure Neural voices.
    Yields base64 audio chunks with sub-300ms response time and 100% male Tech Lead consistency.
    """
    if not text or not text.strip():
        return
        
    profile = VOICE_PROFILES.get(language, VOICE_PROFILES["en"])
    primary_voice = profile["primary"]
    fallbacks = profile["fallbacks"]
    rate = profile["rate"]
    pitch = profile["pitch"]

    chunks = split_into_speech_chunks(text)

    for chunk_text in chunks:
        audio_payload = apply_phonetic_middleware(chunk_text, language)
        audio_bytes = None

        # Tier 1: Authentic Human Voice via ElevenLabs (if configured)
        if _eleven_provider.is_configured():
            try:
                audio_bytes = await asyncio.wait_for(
                    _eleven_provider.generate_full_audio(audio_payload, language),
                    timeout=2.2
                )
            except Exception as e_el:
                print(f"[TTS] ElevenLabs bypassed ({e_el}). Falling back to neural engine...")

        # Tier 2: High-Quality Microsoft Azure Neural Voice
        if not audio_bytes:
            try:
                audio_bytes = await asyncio.wait_for(
                    _edge_provider.generate_full_audio(audio_payload, primary_voice, rate=rate, pitch=pitch),
                    timeout=3.5
                )
            except Exception as e1:
                print(f"[TTS] Primary voice {primary_voice} failed ({e1}). Switching to fallback male voice...")
                for fallback_voice in fallbacks:
                    try:
                        audio_bytes = await asyncio.wait_for(
                            _edge_provider.generate_full_audio(audio_payload, fallback_voice, rate=rate, pitch=pitch),
                            timeout=3.0
                        )
                        if audio_bytes:
                            break
                    except Exception as e_fb:
                        print(f"[TTS] Fallback voice {fallback_voice} failed: {e_fb}")

        if audio_bytes:
            yield base64.b64encode(audio_bytes).decode("utf-8")

async def generate_full_audio_from_text(text: str, language: str = "en") -> Tuple[str, int]:
    """
    Full audio generation for test-voice endpoint and warning alerts.
    """
    if not text or not text.strip():
        return "", 0
        
    profile = VOICE_PROFILES.get(language, VOICE_PROFILES["en"])
    primary_voice = profile["primary"]
    fallbacks = profile["fallbacks"]
    rate = profile["rate"]
    pitch = profile["pitch"]

    audio_payload = apply_phonetic_middleware(text, language)
    audio_bytes = None

    # Tier 1: ElevenLabs Authentic Voice
    if _eleven_provider.is_configured():
        try:
            audio_bytes = await asyncio.wait_for(
                _eleven_provider.generate_full_audio(audio_payload, language),
                timeout=3.0
            )
        except Exception as e_el:
            print(f"[TTS] Full audio ElevenLabs failed ({e_el}). Using neural fallback...")

    # Tier 2: Neural Edge-TTS
    if not audio_bytes:
        try:
            audio_bytes = await asyncio.wait_for(
                _edge_provider.generate_full_audio(audio_payload, primary_voice, rate=rate, pitch=pitch),
                timeout=5.0
            )
        except Exception as e1:
            print(f"[TTS] Full audio primary failed ({e1}). Using fallback...")
            for fallback_voice in fallbacks:
                try:
                    audio_bytes = await asyncio.wait_for(
                        _edge_provider.generate_full_audio(audio_payload, fallback_voice, rate=rate, pitch=pitch),
                        timeout=4.0
                    )
                    if audio_bytes:
                        break
                except Exception:
                    pass

    if audio_bytes:
        return base64.b64encode(audio_bytes).decode("utf-8"), len(text)
    return "", 0
