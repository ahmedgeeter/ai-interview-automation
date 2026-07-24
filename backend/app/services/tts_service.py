import os
import json
import base64
import asyncio
import websockets
from typing import AsyncGenerator

async def text_chunker(chunks: AsyncGenerator[str, None]) -> AsyncGenerator[str, None]:
    """Split text into sentence boundaries to send to ElevenLabs."""
    splitters = {".", "?", "!", "\n"}
    buffer = ""
    async for text in chunks:
        buffer += text
        # If we find a boundary, yield it
        while True:
            # find first splitter
            first_idx = min([buffer.find(s) for s in splitters if buffer.find(s) != -1], default=-1)
            if first_idx != -1:
                yield buffer[:first_idx+1].strip() + " "
                buffer = buffer[first_idx+1:]
            else:
                break
    if buffer.strip():
        yield buffer.strip() + " "

async def stream_audio_from_text(text_chunks: AsyncGenerator[str, None], language: str = "en") -> AsyncGenerator[bytes, None]:
    """Stream text to ElevenLabs and yield audio bytes."""
    api_key = os.getenv("ELEVENLABS_API_KEY", "")
    
    if not api_key:
        print("Warning: ELEVENLABS_API_KEY is not set. Falling back to empty audio.")
        yield b""
        return
        
    voice_id = "21m00Tcm4TlvDq8ikWAM" # Rachel or specify based on language
    # For arabic, we might need a specific voice id or just rely on multilingual
    
    uri = f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id=eleven_multilingual_v2"
    
    try:
        async with websockets.connect(uri) as ws:
            # Send initial configuration with API key
            await ws.send(json.dumps({
                "text": " ",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.8},
                "xi_api_key": api_key,
            }))
            
            async def sender(ws_conn):
                async for chunk in text_chunker(text_chunks):
                    if chunk:
                        await ws_conn.send(json.dumps({"text": chunk, "try_trigger_generation": True}))
                # Send EOS
                await ws_conn.send(json.dumps({"text": ""}))
            
            sender_task = asyncio.create_task(sender(ws))
            
            while True:
                try:
                    message = await ws.recv()
                    data = json.loads(message)
                    if data.get("audio"):
                        audio_bytes = base64.b64decode(data["audio"])
                        yield audio_bytes
                    if data.get("isFinal"):
                        break
                except websockets.exceptions.ConnectionClosed:
                    break
            
            await sender_task
            
    except Exception as e:
        print(f"ElevenLabs connection error: {e}")
        yield b""
