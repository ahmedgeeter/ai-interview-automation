"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { 
  playMp3Base64, 
  stopCurrentAudio as stopAudio, 
  pauseAudio as pauseAudioMgr, 
  resumeAudio as resumeAudioMgr, 
  isAudioUnlocked,
  onAudioUnlocked,
  unlockAudioContext 
} from "@/lib/audioManager";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Message {
  role: "ai" | "user" | "system";
  content: string;
  time: string;
  isWarning?: boolean;
}
export interface Telemetry {
  prompt: number;
  completion: number;
  latency: number;
  totalPrompt: number;
  totalCompletion: number;
  voiceTokens: number;
  totalVoiceTokens: number;
}
export interface LiveScores {
  technical: number;
  communication: number;
  problem_solving: number;
}
export interface SessionConfig {
  job_title: string;
  limit_mode: string;
  limit_value: number;
  voice_lang: string;
}

export type TurnState = "LISTENING" | "THINKING" | "SPEAKING" | "EVALUATING" | "COMPLETED";

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useInterview(
  sessionId: string,
  isVoiceMuted: boolean,
  voiceLang: "en" | "ar" | "ar-eg",
  onTranscriptChange: (t: string) => void
) {
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [turnState, setTurnState] = useState<TurnState>("LISTENING");
  const [isTyping, setIsTyping] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [isWakingUpServer, setIsWakingUpServer] = useState(false);
  const [serverAwake, setServerAwake] = useState(true);
  const [liveScores, setLiveScores] = useState<LiveScores | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry>({
    prompt: 0, completion: 0, latency: 0, totalPrompt: 0, totalCompletion: 0, voiceTokens: 0, totalVoiceTokens: 0,
  });
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [pendingAudio, setPendingAudio] = useState<string | null>(null); 

  const turnStateRef = useRef<TurnState>(turnState);
  useEffect(() => {
    turnStateRef.current = turnState;
  }, [turnState]);

  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const retryCount = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isVoiceMutedRef = useRef(isVoiceMuted);
  const isAudioPausedRef = useRef(false);
  const audioQueue = useRef<string[]>([]);
  const isPlayingAudio = useRef(false);

  useEffect(() => { isVoiceMutedRef.current = isVoiceMuted; }, [isVoiceMuted]);

  const now = useCallback(
    () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    []
  );

  useEffect(() => {
    if (!sessionId) return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    fetch(`${API_URL}/api/session/${sessionId}/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data && !data.error) setSessionConfig(data); })
      .catch(() => {});
  }, [sessionId]);

  // Audio Playback Queue
  const processAudioQueue = useCallback(async () => {
    if (isPlayingAudio.current || audioQueue.current.length === 0 || isVoiceMutedRef.current || isAudioPausedRef.current) return;
    
    if (!isAudioUnlocked()) {
      return;
    }

    const chunk = audioQueue.current.shift();
    if (!chunk) return;

    isPlayingAudio.current = true;
    setIsAiSpeaking(true);
    setTurnState("SPEAKING");

    playMp3Base64(
      chunk,
      () => {}, // onStart
      () => {
        isPlayingAudio.current = false;
        if (isAudioPausedRef.current) {
          // User paused while this chunk was finishing; hold queue
          return;
        }
        if (audioQueue.current.length > 0) {
          processAudioQueue();
        } else {
          setIsAiSpeaking(false);
          setTurnState("LISTENING");
        }
      }
    );
  }, []);

  const queueAudioChunk = useCallback((base64Audio: string) => {
    if (!base64Audio) return;
    audioQueue.current.push(base64Audio);
    processAudioQueue();
  }, [processAudioQueue]);

  const flushAudioQueue = useCallback(() => {
    if (!isPlayingAudio.current && audioQueue.current.length > 0) {
      processAudioQueue();
    }
  }, [processAudioQueue]);

  // Immediately play queued audio as soon as audio context unlocks via user gesture
  useEffect(() => {
    onAudioUnlocked(() => {
      flushAudioQueue();
    });

    const handleInteraction = async () => {
      if (!isAudioUnlocked()) {
        await unlockAudioContext();
        flushAudioQueue();
      }
    };

    window.addEventListener("click", handleInteraction, { once: true });
    window.addEventListener("touchstart", handleInteraction, { once: true });

    return () => {
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
    };
  }, [flushAudioQueue]);

  const pauseAudio = useCallback(() => {
    pauseAudioMgr();
    isAudioPausedRef.current = true;
    setIsAudioPaused(true);
  }, []);

  const resumeAudio = useCallback(async () => {
    isAudioPausedRef.current = false;
    setIsAudioPaused(false);
    await resumeAudioMgr();
    if (!isPlayingAudio.current && audioQueue.current.length > 0) {
      processAudioQueue();
    }
  }, [processAudioQueue]);

  const togglePauseAudio = useCallback(() => {
    if (isAudioPausedRef.current) {
      resumeAudio();
    } else {
      pauseAudio();
    }
  }, [pauseAudio, resumeAudio]);

  const stopCurrentAudio = useCallback(() => {
    stopAudio();
    audioQueue.current = [];
    isPlayingAudio.current = false;
    isAudioPausedRef.current = false;
    setIsAudioPaused(false);
    setIsAiSpeaking(false);
    setTurnState("LISTENING");
  }, []);

  // Speech Recognition
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = voiceLang.startsWith("ar") ? "ar-SA" : "en-US";
    r.onstart = () => { setIsListening(true); isListeningRef.current = true; };
    r.onresult = (e: any) => {
      // Discard input if AI is thinking
      if (turnState === "THINKING") return;
      
      let transcript = "";
      for (let i = e.resultIndex; i < e.results.length; ++i) {
        if (e.results[i].isFinal) transcript += e.results[i][0].transcript + " ";
      }
      if (transcript) onTranscriptChange(transcript);
    };
    r.onerror = (e: any) => {
      if (e.error === "not-allowed") { setIsListening(false); isListeningRef.current = false; }
    };
    r.onend = () => {
      if (isListeningRef.current) {
        try { r.start(); } catch { setIsListening(false); isListeningRef.current = false; }
      } else {
        setIsListening(false);
      }
    };
    recognitionRef.current = r;
    return () => { try { r.stop(); } catch {} };
  }, [voiceLang, onTranscriptChange, turnState]);

  const toggleListening = useCallback(() => {
    if (isListening) { isListeningRef.current = false; recognitionRef.current?.stop(); }
    else { try { recognitionRef.current?.start(); } catch {} }
  }, [isListening]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    recognitionRef.current?.stop();
  }, []);

  const handleInterrupt = useCallback(() => {
    audioQueue.current = [];
    isPlayingAudio.current = false;
    stopCurrentAudio();
    setTurnState("LISTENING");
    wsRef.current?.send(JSON.stringify({ type: "interrupt" }));
  }, [stopCurrentAudio]);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setTurnState("THINKING");
    const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
    const ws = new WebSocket(`${WS_URL}/ws/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => { setIsConnected(true); retryCount.current = 0; setTurnState("LISTENING"); };

    ws.onmessage = (event) => {
      try {
        const d = JSON.parse(event.data);

        if (d.type === "ping") {
          // just ignore ping
        } else if (d.type === "interrupt") {
          stopCurrentAudio();
          setTurnState("LISTENING");
        } else if (d.type === "text_delta") {
          setIsTyping(false);
          setStreamingText((prev) => prev + d.delta);

        } else if (d.type === "message") {
          setIsTyping(false);
          setStreamingText("");
          setTurnState("SPEAKING");
          setMessages((prev) => [
            ...prev,
            { role: d.is_warning ? "system" : "ai", content: d.content, time: now(), isWarning: d.is_warning },
          ]);
          if (d.audio_base64) queueAudioChunk(d.audio_base64); // legacy fallback
          if (d.question_count !== undefined) setQuestionCount(d.question_count);

          if (d.content && (d.content.includes("concluded") || d.content.includes("scorecard"))) {
            setTurnState("EVALUATING");
            // Smooth auto-redirect to scorecard page
            setTimeout(() => {
              router.push(`/scorecard/${sessionId}`);
            }, 2500);
          }

        } else if (d.type === "audio_chunk") {
          if (d.audio_base64) queueAudioChunk(d.audio_base64);
        } else if (d.type === "telemetry") {
          setIsTyping(false);
          setTelemetry((prev) => ({
            prompt: d.prompt_tokens ?? 0,
            completion: d.completion_tokens ?? 0,
            latency: d.latency_ms ?? 0,
            totalPrompt: prev.totalPrompt + (d.prompt_tokens ?? 0),
            totalCompletion: prev.totalCompletion + (d.completion_tokens ?? 0),
            voiceTokens: d.voice_tokens ?? 0,
            totalVoiceTokens: prev.totalVoiceTokens + (d.voice_tokens ?? 0),
          }));

        } else if (d.type === "live_scores") {
          setLiveScores(d.scores);

        } else if (d.type === "evaluation_complete") {
          setTurnState("COMPLETED");
          router.push(`/scorecard/${sessionId}`);

        } else if (d.type === "error") {
          setIsTyping(false);
          setTurnState("LISTENING");
          console.error("[WS] Server error:", d.message);
        }
      } catch (e) {
        console.error("[WS] Message parse error:", e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (turnStateRef.current === "EVALUATING" || turnStateRef.current === "COMPLETED") return;
      const delay = Math.min(1000 * 2 ** retryCount.current, 30000);
      reconnectTimeoutRef.current = setTimeout(() => {
        retryCount.current += 1;
        connectWebSocket();
      }, delay);
    };

    ws.onerror = (e) => {
      console.error("[WS] Error:", e);
    };
  }, [sessionId, now, queueAudioChunk, router, stopCurrentAudio]);

  // Intelligent wake-up indicator: only display if initial connection takes > 4s
  useEffect(() => {
    if (isConnected) {
      setIsWakingUpServer(false);
      return;
    }
    const timer = setTimeout(() => {
      if (!isConnected) setIsWakingUpServer(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, [isConnected]);

  // Tab-switch integrity monitoring (Anti-Cheat Proctoring)
  const lastTabSwitchSent = useRef<number>(0);
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.hidden && wsRef.current?.readyState === WebSocket.OPEN) {
        const nowMs = Date.now();
        // Throttle tab switch alerts by at least 4 seconds to prevent flood
        if (nowMs - lastTabSwitchSent.current > 4000) {
          lastTabSwitchSent.current = nowMs;
          console.warn("[Anti-Cheat] Tab switch captured. Sending telemetry signal...");
          wsRef.current.send(JSON.stringify({ type: "tab_switch" }));
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (sessionId) connectWebSocket();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      stopAudio();
    };
  }, [sessionId, connectWebSocket]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || wsRef.current?.readyState !== WebSocket.OPEN) return;
      
      // Stop and clear any existing audio queue completely when candidate speaks/submits
      audioQueue.current = [];
      isPlayingAudio.current = false;
      stopCurrentAudio();

      setTurnState("THINKING");
      setMessages((prev) => [...prev, { role: "user", content, time: now() }]);
      setIsTyping(true);
      setStreamingText("");
      wsRef.current.send(JSON.stringify({ type: "message", content }));
    },
    [now, stopCurrentAudio]
  );

  const sendEndInterview = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setTurnState("EVALUATING");
      wsRef.current.send(JSON.stringify({ type: "end_interview" }));
      setIsTyping(true);
      // Failsafe auto-redirect after 3.5 seconds
      setTimeout(() => {
        router.push(`/scorecard/${sessionId}`);
      }, 3500);
    }
  }, [router, sessionId]);

  const changeLanguage = useCallback((lang: "en" | "ar" | "ar-eg") => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ type: "change_language", content: lang }));
  }, []);

  return {
    messages, isConnected, isTyping, turnState, isAiSpeaking, isListening, isWakingUpServer,
    questionCount, liveScores, telemetry, streamingText, sessionConfig, pendingAudio, setPendingAudio,
    sendMessage, sendEndInterview, changeLanguage, handleInterrupt, playAudio: queueAudioChunk,
    flushAudioQueue, toggleListening, stopListening, stopCurrentAudio, setIsAiSpeaking,
    isAudioPaused, pauseAudio, resumeAudio, togglePauseAudio
  };
}
