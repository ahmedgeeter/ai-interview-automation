import os
import base64
import re
import asyncio
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Tuple

# We will use edge-tts as primary and gTTS as fallback
import edge_tts
from gtts import gTTS
import io

class BaseTTSProvider(ABC):
    @abstractmethod
    async def generate_audio_stream(self, text: str, voice: str) -> AsyncGenerator[bytes, None]:
        """Yields audio chunks as bytes"""
        pass

    @abstractmethod
    async def generate_full_audio(self, text: str, voice: str) -> bytes:
        """Returns the complete audio bytes"""
        pass

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
    
    primary = EdgeTTSProvider()
    fallback = FallbackTTSProvider()
    
    for sentence in sentences:
        try:
            audio_bytes = await primary.generate_full_audio(sentence, voice)
        except Exception as e:
            print(f"[TTS] Primary provider failed for sentence: {e}, falling back.")
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
    primary = EdgeTTSProvider()
    fallback = FallbackTTSProvider()
    
    try:
        audio_bytes = await primary.generate_full_audio(text, voice)
    except Exception as e:
        audio_bytes = await fallback.generate_full_audio(text, voice)
        
    if audio_bytes:
        return base64.b64encode(audio_bytes).decode("utf-8"), len(text)
    return "", 0
