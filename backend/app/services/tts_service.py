import os
import threading
import base64
import wave
import io
import asyncio
import dashscope
from dashscope.audio.qwen_tts_realtime import QwenTtsRealtime, QwenTtsRealtimeCallback, AudioFormat

class MemoryCallback(QwenTtsRealtimeCallback):
    def __init__(self):
        super().__init__()
        self.complete_event = threading.Event()
        self.audio_bytes = bytearray()
        self.error = None
        
    def on_event(self, response: dict) -> None:
        try:
            type = response['type']
            if type == 'response.audio.delta':
                self.audio_bytes.extend(base64.b64decode(response['delta']))
            elif type == 'session.finished':
                self.complete_event.set()
        except Exception as e:
            self.error = str(e)
            
    def on_close(self, close_status_code, close_msg) -> None:
        self.complete_event.set()

def _sync_generate_qwen_tts(text: str, voice: str) -> str:
    dashscope.api_key = os.getenv("DASHSCOPE_API_KEY", "")
    if not dashscope.api_key:
        print("Warning: DASHSCOPE_API_KEY not set")
        return ""
        
    callback = MemoryCallback()
    qwen_tts_realtime = QwenTtsRealtime(
        model='qwen3-tts-flash-realtime',
        callback=callback,
        # Int'l endpoint; use wss://dashscope.aliyuncs.com/api-ws/v1/realtime for mainland China
        url='wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime'
    )
    
    try:
        qwen_tts_realtime.connect()
        qwen_tts_realtime.update_session(
            voice=voice,
            response_format=AudioFormat.PCM_24000HZ_MONO_16BIT,
            mode='server_commit'
        )
        qwen_tts_realtime.append_text(text)
        qwen_tts_realtime.finish()
        
        # Wait for completion
        callback.complete_event.wait(timeout=30)
        
        if callback.error or not callback.audio_bytes:
            print(f"Qwen TTS error: {callback.error}")
            return ""
            
        # Wrap PCM in WAV
        wav_io = io.BytesIO()
        with wave.open(wav_io, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2) # 16-bit
            wav_file.setframerate(24000)
            wav_file.writeframes(callback.audio_bytes)
            
        wav_bytes = wav_io.getvalue()
        return base64.b64encode(wav_bytes).decode("utf-8")
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return ""
    finally:
        try:
            qwen_tts_realtime.close()
        except:
            pass

async def generate_full_audio_from_text(text: str, language: str = "en") -> str:
    """Call Alibaba Cloud Qwen Real-Time TTS to generate full audio and return as base64."""
    if not text.strip():
        return ""
    
    voice = "Cherry"
    if language == "ar":
        voice = "longanlingxi" 
    
    return await asyncio.to_thread(_sync_generate_qwen_tts, text, voice)
