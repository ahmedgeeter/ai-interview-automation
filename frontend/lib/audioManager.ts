/**
 * Singleton HTML5 Audio manager.
 * 
 * Uses a single HTMLAudioElement for all playback. Attached to the DOM
 * to ensure maximum compatibility with browser autoplay policies.
 * 
 * Uses Blob URLs instead of base64 data URIs to avoid string length limits
 * and ensure perfect MIME type handling by the browser's media engine.
 * 
 * Provides Pause, Resume, Stop, and Play capabilities.
 */

let _audio: HTMLAudioElement | null = null;
let _isUnlocked = false;
let _isPaused = false;
let _currentOnEnd: (() => void) | null = null;

function getAudio(): HTMLAudioElement {
  if (!_audio) {
    if (typeof window !== "undefined") {
      _audio = document.createElement('audio');
      _audio.id = "global-ai-audio";
      _audio.preload = "auto";
      _audio.style.display = "none";
      document.body.appendChild(_audio);
    }
  }
  return _audio as HTMLAudioElement;
}

let _onUnlockCallbacks: Array<() => void> = [];

export function onAudioUnlocked(cb: () => void) {
  if (_isUnlocked) {
    try { cb(); } catch {}
  } else {
    _onUnlockCallbacks.push(cb);
  }
}

/** Call this inside a user click/touch event to unlock audio for the session safely. */
export async function unlockAudioContext(): Promise<void> {
  if (typeof window === "undefined" || _isUnlocked) return;
  
  try {
    _isUnlocked = true; // Mark as unlocked immediately upon user gesture
    
    // Unlock using Web Audio Context or a temporary detached element to never pollute _audio
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      await ctx.resume();
      // Generate micro-buffer silence
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    }

    // Also prime our playback HTMLAudioElement safely
    const audio = getAudio();
    audio.volume = 1.0;

    console.log("[Audio] HTML5 Audio unlocked successfully via user gesture");
    const cbs = [..._onUnlockCallbacks];
    _onUnlockCallbacks = [];
    cbs.forEach(cb => {
      try { cb(); } catch {}
    });
  } catch (e) {
    console.error("[Audio] Unlock error:", e);
  }
}

/** Returns true if audio has been successfully unlocked. */
export function isAudioUnlocked(): boolean {
  return _isUnlocked;
}

/** Returns true if audio is currently paused. */
export function isAudioPaused(): boolean {
  return _isPaused;
}

/** Returns true if audio is actively playing. */
export function isAudioPlaying(): boolean {
  if (!_audio) return false;
  return !_audio.paused && !_audio.ended && _audio.currentTime > 0;
}

/** Pause currently playing audio without clearing src or dropping position. */
export function pauseAudio(): void {
  if (_audio && !_audio.paused) {
    _audio.pause();
    _isPaused = true;
    console.log("[Audio] Playback paused at", _audio.currentTime);
  }
}

/** Resume currently paused audio from where it stopped. */
export async function resumeAudio(): Promise<void> {
  if (_audio && _isPaused) {
    try {
      _isPaused = false;
      await _audio.play();
      console.log("[Audio] Playback resumed from", _audio.currentTime);
    } catch (e) {
      console.error("[Audio] Resume error:", e);
    }
  }
}

/** Stop currently playing audio and reset playback state cleanly. */
export function stopCurrentAudio(triggerOnEnd: boolean = false): void {
  _isPaused = false;
  const cb = _currentOnEnd;
  _currentOnEnd = null; // Clear first to prevent re-entrant calls

  if (_audio) {
    _audio.pause();
    _audio.currentTime = 0;
    _audio.onplay = null;
    _audio.onended = null;
    _audio.onerror = null;
    if (_audio.src && _audio.src.startsWith('blob:')) {
      try { URL.revokeObjectURL(_audio.src); } catch {}
    }
    _audio.src = "";
  }

  if (triggerOnEnd && cb) {
    try { cb(); } catch {}
  }
}

/**
 * Play an MP3 from a base64 string via HTML5 Audio Blob.
 * Ensures the audio buffer is ready before playback to prevent dropping initial words.
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
    _isPaused = false;
    _currentOnEnd = onEnd || null;
    
    // Clear previous listeners
    audio.onplay = null;
    audio.onended = null;
    audio.onerror = null;

    // Convert Base64 to Blob
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const blobUrl = URL.createObjectURL(blob);
    
    // Clean up previous blob URL if exists
    if (audio.src && audio.src.startsWith('blob:')) {
      try { URL.revokeObjectURL(audio.src); } catch {}
    }

    audio.src = blobUrl;
    audio.volume = 1.0;

    // Set up listeners
    audio.onplay = () => {
      onStart?.();
    };
    
    audio.onended = () => {
      _currentOnEnd = null;
      try { URL.revokeObjectURL(blobUrl); } catch {}
      onEnd?.();
    };
    
    audio.onerror = (e) => {
      console.error("[Audio] HTML5 Audio error:", audio.error);
      _currentOnEnd = null;
      try { URL.revokeObjectURL(blobUrl); } catch {}
      onEnd?.();
    };

    // Play with graceful handling
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      await playPromise;
    }
  } catch (e: any) {
    // If AbortError (interrupted by user or new message), cleanly resolve without panic
    if (e?.name !== "AbortError") {
      console.warn("[Audio] Playback exception:", e);
    }
    const cb = _currentOnEnd;
    _currentOnEnd = null;
    cb?.();
  }
}

