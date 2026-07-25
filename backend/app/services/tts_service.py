import os
import aiohttp
from typing import AsyncGenerator

async def generate_full_audio_from_text(text: str, language: str = "en") -> str:
    """Call ElevenLabs REST API to generate the full audio and return as base64."""
    api_key = os.getenv("ELEVENLABS_API_KEY", "")
    
    if not api_key or not text.strip():
        print("Warning: ELEVENLABS_API_KEY is not set or text is empty. Falling back to empty audio.")
        return ""
        
    voice_id = "21m00Tcm4TlvDq8ikWAM" # Rachel
    
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    
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
            "similarity_boost": 0.8
        }
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=data, headers=headers) as response:
                if response.status == 200:
                    audio_bytes = await response.read()
                    import base64
                    return base64.b64encode(audio_bytes).decode("utf-8")
                else:
                    error_text = await response.text()
                    print(f"ElevenLabs REST API error {response.status}: {error_text}")
                    return ""
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"ElevenLabs connection error: {e}")
        return ""
