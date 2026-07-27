import asyncio
import base64
import httpx
import os
import re

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_API_KEY_FALLBACK = os.getenv("ELEVENLABS_API_KEY_FALLBACK")

# Voice map: language -> ElevenLabs Voice ID (using pre-made free voices)
VOICE_MAP = {
    # Charlie - Deep, Confident, Energetic
    "en": "IKne3meq5aSn9XLyUdCD",  
    # George - Warm, Captivating Storyteller (Excellent for Arabic Dialects)
    "ar": "JBFqnCBsd6RMkjVDRZzb",  
    # George (Default Voice allowed on Free Tier, excellent for Arabic)
    "ar-eg": "JBFqnCBsd6RMkjVDRZzb",
}

from typing import Tuple

async def generate_full_audio_from_text(text: str, language: str = "en") -> Tuple[str, int]:
    """
    Generate audio using ElevenLabs API.
    Returns base64-encoded MP3 audio string.
    """
    if not text or not text.strip():
        return "", 0

    if language == "ar-eg":
        # Phonetic Regex Mapping for Egyptian Colloquial (Adding Diacritics silently for ElevenLabs)
        replacements = {
            r'\b(?:إزيك|ازيك)\b': 'إِزَّيَكْ',
            r'\bالمصري\b': 'المَصْرِيِّ',
            r'\bالمصريه\b': 'المَصْرِيَّة',
            r'\b(?:إيه|ايه)\b': 'إِيهْ',
            r'\b(?:كده|كدا)\b': 'كِدَه',
            r'\bدي\b': 'دِي',
            r'\bده\b': 'دَه',
            r'\bعايز\b': 'عَايِز',
            r'\bعايزة\b': 'عَايْزَة',
            r'\bعايزين\b': 'عَايْزِين',
            r'\bمش\b': 'مِشْ',
            r'\bعلشان\b': 'عَلَشَانْ',
            r'\bعشان\b': 'عَشَانْ',
            r'\bالنهاردة\b': 'النَّهَارْدَة',
            r'\bبتاع\b': 'بِتَاعْ',
            r'\bبس\b': 'بَسْ',
            r'\bطب\b': 'طَبْ',
            r'\bاوي\b': 'أَوِي',
            r'\bقوي\b': 'أَوِي', # Egyptians pronounce strong as "Awi"
            r'\bبجد\b': 'بِجَدْ',
            r'\bكويس\b': 'كُوَيِّس',
            r'\bشوية\b': 'شُوَيَّة',
            r'\bيعني\b': 'يَعْنِي',
            r'\bممكن\b': 'مُمْكِن',
            r'\bإحنا\b': 'إِحْنَا'
        }
        for pattern, replacement in replacements.items():
            text = re.sub(pattern, replacement, text)
    
    if not ELEVENLABS_API_KEY:
        print("[TTS] ELEVENLABS_API_KEY not found in environment!")
        return "", 0

    voice_id = VOICE_MAP.get(language, VOICE_MAP["en"])
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?optimize_streaming_latency=3&output_format=mp3_44100_96"

    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY
    }

    # Turbo v2.5 supports 32 languages including Arabic, and it is the fastest and cheapest model.
    # User requested eleven_multilingual_v2 or eleven_flash_v2_5 for Arabic. 
    # Flash is faster and cheaper, Multilingual v2 is heavier but highly accurate. We'll use multilingual_v2 for best Arabic tuning.
    model_id = "eleven_multilingual_v2" if language in ("ar", "ar-eg") else "eleven_turbo_v2_5"

    if language == "ar-eg":
        voice_settings = {
            "stability": 0.35,
            "similarity_boost": 0.80,
            "style": 0.15,
            "use_speaker_boost": True
        }
    elif language == "ar":
        voice_settings = {
            "stability": 0.75,
            "similarity_boost": 0.85,
            "style": 0.0,
            "use_speaker_boost": True
        }
    else:
        voice_settings = {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True
        }

    data = {
        "text": text,
        "model_id": model_id,
        "voice_settings": voice_settings
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=data, headers=headers)
            response.raise_for_status()
            audio_data = response.content
            
            if not audio_data:
                print(f"[TTS] ElevenLabs returned empty audio for language={language}")
                return "", 0

            return base64.b64encode(audio_data).decode("utf-8"), len(text)

    except Exception as e:
        print(f"[TTS] Primary ElevenLabs error: {e}")
        if ELEVENLABS_API_KEY_FALLBACK:
            print("[TTS] Falling back to secondary ElevenLabs API Key...")
            headers["xi-api-key"] = ELEVENLABS_API_KEY_FALLBACK
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.post(url, json=data, headers=headers)
                    response.raise_for_status()
                    audio_data = response.content
                    if audio_data:
                        return base64.b64encode(audio_data).decode("utf-8"), len(text)
            except Exception as fallback_e:
                print(f"[TTS] Fallback ElevenLabs error: {fallback_e}")
        
        return "", 0
