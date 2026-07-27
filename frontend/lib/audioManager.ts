/**
 * Singleton HTML5 Audio manager.
 * 
 * Uses a single HTMLAudioElement for all playback. Attached to the DOM
 * to ensure maximum compatibility with browser autoplay policies.
 * 
 * Uses Blob URLs instead of base64 data URIs to avoid string length limits
 * and ensure perfect MIME type handling by the browser's media engine.
 */

let _audio: HTMLAudioElement | null = null;
let _isUnlocked = false;

function getAudio(): HTMLAudioElement {
  if (!_audio) {
    if (typeof window !== "undefined") {
      _audio = document.createElement('audio');
      _audio.id = "global-ai-audio";
      _audio.style.display = "none";
      document.body.appendChild(_audio);
    }
  }
  return _audio as HTMLAudioElement;
}

/** Call this inside a user click/touch event to unlock audio for the session. */
export async function unlockAudioContext(): Promise<void> {
  if (typeof window === "undefined") return;
  
  try {
    const audio = getAudio();
    _isUnlocked = true; // Mark as unlocked immediately upon user gesture
    // A tiny, silent MP3 base64 string to initialize the audio engine during a user gesture
    audio.src = "data:audio/mpeg;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
    await audio.play();
    console.log("[Audio] HTML5 Audio unlocked successfully via user gesture");
  } catch (e) {
    console.error("[Audio] Unlock error:", e);
  }
}

/** Returns true if audio has been successfully unlocked. */
export function isAudioUnlocked(): boolean {
  return _isUnlocked;
}

/** Stop currently playing audio. */
export function stopCurrentAudio(): void {
  if (_audio) {
    _audio.pause();
    _audio.currentTime = 0;
  }
}

/**
 * Play an MP3 from a base64 string via HTML5 Audio Blob.
 */
export async function playMp3Base64(
  base64: string,
  onStart?: () => void,
  onEnd?: () => void
): Promise<void> {
  if (!base64 || typeof window === "undefined") {
    onEnd?.();
    return;
  }

  try {
    const audio = getAudio();
    
    // Clear previous listeners
    audio.onplay = null;
    audio.onended = null;
    audio.onerror = null;

    // Set up new listeners
    audio.onplay = () => {
      console.log("[Audio] Playback started successfully");
      onStart?.();
    };
    
    audio.onended = () => {
      console.log("[Audio] Playback ended naturally");
      onEnd?.();
    };
    
    audio.onerror = (e) => {
      console.error("[Audio] HTML5 Audio error during playback:", audio.error);
      onEnd?.();
    };

    // Convert Base64 to Blob to avoid Data URL length limits and ensure perfect MIME handling
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const blobUrl = URL.createObjectURL(blob);
    
    // Clean up previous blob URL if exists to avoid memory leaks
    if (audio.src && audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(audio.src);
    }

    audio.src = blobUrl;
    audio.volume = 1.0;
    
    // Play the new source
    console.log(`[Audio] Attempting to play new audio blob (${bytes.length} bytes)...`);
    await audio.play();
  } catch (e) {
    console.error("[Audio] Playback error:", e);
    onEnd?.();
  }
}
