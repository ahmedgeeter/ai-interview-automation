import os
import base64
import re
import asyncio
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Tuple

# We will use ElevenLabs as primary, edge-tts as secondary, and gTTS as ultimate fallback
import edge_tts
from gtts import gTTS
import io
import httpx

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
    def __init__(self):
        self.keys = []
        primary = os.getenv("ELEVENLABS_API_KEY")
        if primary: self.keys.append(primary)
        fallback = os.getenv("ELEVENLABS_API_KEY_FALLBACK")
        if fallback: self.keys.append(fallback)
        self.current_key_idx = 0

    def _get_current_key(self):
        if not self.keys:
            return None
        return self.keys[self.current_key_idx]

    def _rotate_key(self):
        if len(self.keys) > 1:
            self.current_key_idx = (self.current_key_idx + 1) % len(self.keys)

    def _get_voice_id(self, language: str) -> str:
        # Adam voice ID
        return "pNInz6obpgDQGcFmaJgB"

    async def generate_audio_stream(self, text: str, voice: str) -> AsyncGenerator[bytes, None]:
        audio_data = await self.generate_full_audio(text, voice)
        yield audio_data

    async def generate_full_audio(self, text: str, voice: str) -> bytes:
        api_key = self._get_current_key()
        if not api_key:
            raise ValueError("No ElevenLabs API key configured")
        
        # We pass `language` in `voice` param during the pipeline
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{self._get_voice_id(voice)}"
        headers = {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": api_key
        }
        data = {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75
            }
        }

        for _ in range(max(1, len(self.keys))):
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=data, headers=headers, timeout=15.0)
                if response.status_code == 200:
                    return response.content
                elif response.status_code in (401, 429):
                    print(f"[ElevenLabsProvider] Error {response.status_code}. Rotating key...")
                    self._rotate_key()
                    headers["xi-api-key"] = self._get_current_key()
                else:
                    raise Exception(f"ElevenLabs API Error: {response.status_code} - {response.text}")
        
        raise Exception("All ElevenLabs API keys failed or rate limited.")

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
        # gTTS is blocking, so we run it in a thread and return it as a single chunk
        audio = await self.generate_full_audio(text, voice)
        yield audio

    async def generate_full_audio(self, text: str, voice: str) -> bytes:
        try:
            # map edge-tts voice to gTTS language code roughly
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
            # ultimate fallback: empty audio
            return b""


def get_voice_for_language(language: str) -> str:
    if language in ("ar", "ar-eg"):
        return "ar-EG-SalmaNeural"
    return "en-US-ChristopherNeural"

def split_into_sentences(text: str) -> list[str]:
    # Simple regex to split on punctuation but keep it
    sentences = re.split(r'(?<=[.!?؟])\s+', text.strip())
    return [s for s in sentences if s.strip()]

async def generate_audio_chunks_from_text(text: str, language: str = "en") -> AsyncGenerator[str, None]:
    """
    Splits text into sentences, generates audio for each using Strategy Pattern,
    and yields base64 encoded chunks.
    """
    if not text or not text.strip():
        return
        
    voice = get_voice_for_language(language)
    sentences = split_into_sentences(text)
    
    primary = ElevenLabsProvider()
    secondary = EdgeTTSProvider()
    fallback = FallbackTTSProvider()
    
    for sentence in sentences:
        try:
            audio_bytes = await primary.generate_full_audio(sentence, language)
        except Exception as e:
            print(f"[TTS] ElevenLabs failed: {e}. Trying EdgeTTS...")
            try:
                audio_bytes = await secondary.generate_full_audio(sentence, voice)
            except Exception as e2:
                print(f"[TTS] EdgeTTS failed: {e2}. Trying Fallback gTTS...")
                audio_bytes = await fallback.generate_full_audio(sentence, voice)
            
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
    primary = ElevenLabsProvider()
    secondary = EdgeTTSProvider()
    fallback = FallbackTTSProvider()
    
    try:
        audio_bytes = await primary.generate_full_audio(text, language)
    except Exception as e:
        print(f"[TTS] ElevenLabs failed: {e}. Trying EdgeTTS...")
        try:
            audio_bytes = await secondary.generate_full_audio(text, voice)
        except Exception as e2:
            print(f"[TTS] EdgeTTS failed: {e2}. Trying Fallback gTTS...")
            audio_bytes = await fallback.generate_full_audio(text, voice)
        
    if audio_bytes:
        return base64.b64encode(audio_bytes).decode("utf-8"), len(text)
    return "", 0
