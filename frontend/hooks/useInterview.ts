"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { playMp3Base64, stopCurrentAudio as stopAudio, isAudioUnlocked } from "@/lib/audioManager";

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
  const [isTyping, setIsTyping] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [isWakingUpServer, setIsWakingUpServer] = useState(false);
  const [serverAwake, setServerAwake] = useState(false);
  const [liveScores, setLiveScores] = useState<LiveScores | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry>({
    prompt: 0, completion: 0, latency: 0, totalPrompt: 0, totalCompletion: 0, voiceTokens: 0, totalVoiceTokens: 0,
  });
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [pendingAudio, setPendingAudio] = useState<string | null>(null); // NEW: Store intercepted audio

  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const retryCount = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isVoiceMutedRef = useRef(isVoiceMuted);

  useEffect(() => { isVoiceMutedRef.current = isVoiceMuted; }, [isVoiceMuted]);

  const now = useCallback(
    () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    []
  );

  // Fetch session config (jobTitle, limitMode, limitValue, voiceLang)
  useEffect(() => {
    if (!sessionId) return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    fetch(`${API_URL}/api/session/${sessionId}/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data && !data.error) setSessionConfig(data); })
      .catch(() => {});
  }, [sessionId]);

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
  }, [voiceLang, onTranscriptChange]);

  const toggleListening = useCallback(() => {
    if (isListening) { isListeningRef.current = false; recognitionRef.current?.stop(); }
    else { try { recognitionRef.current?.start(); } catch {} }
  }, [isListening]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    recognitionRef.current?.stop();
  }, []);

  // ─── Audio playback via Web Audio API ────────────────────────────────────────
  const playAudio = useCallback((base64Audio: string) => {
    if (!base64Audio || isVoiceMutedRef.current) return;
    
    // CRITICAL FIX: If audio is not unlocked yet, DO NOT PLAY, save it for later!
    if (!isAudioUnlocked()) {
      console.warn("[useInterview] Audio not unlocked yet. Storing in pendingAudio.");
      setPendingAudio(base64Audio);
      return;
    }

    playMp3Base64(
      base64Audio,
      () => setIsAiSpeaking(true),
      () => setIsAiSpeaking(false)
    );
  }, []);

  const stopCurrentAudio = useCallback(() => {
    stopAudio();
    setIsAiSpeaking(false);
  }, []);

  // ─── WebSocket ────────────────────────────────────────────────────────────────
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setIsTyping(true);
    const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
    const ws = new WebSocket(`${WS_URL}/ws/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => { setIsConnected(true); retryCount.current = 0; };

    ws.onmessage = (event) => {
      try {
        const d = JSON.parse(event.data);

        if (d.type === "text_delta") {
          setIsTyping(false);
          setStreamingText((prev) => prev + d.delta);

        } else if (d.type === "message") {
          setIsTyping(false);
          setStreamingText("");
          setMessages((prev) => [
            ...prev,
            { role: d.is_warning ? "system" : "ai", content: d.content, time: now(), isWarning: d.is_warning },
          ]);
          if (d.audio_base64) playAudio(d.audio_base64);
          if (d.question_count !== undefined) setQuestionCount(d.question_count);

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
          router.push(`/scorecard/${sessionId}`);

        } else if (d.type === "error") {
          setIsTyping(false);
          console.error("[WS] Server error:", d.message);
        }
      } catch (e) {
        console.error("[WS] Message parse error:", e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      const delay = Math.min(1000 * 2 ** retryCount.current, 30000);
      reconnectTimeoutRef.current = setTimeout(() => {
        retryCount.current += 1;
        connectWebSocket();
      }, delay);
    };

    ws.onerror = (e) => {
      console.error("[WS] Error:", e);
    };
  }, [sessionId, now, playAudio, router]);

  // Health check polling to wake up Render free instance
  useEffect(() => {
    if (!sessionId || serverAwake) return;
    
    let isMounted = true;
    const checkHealth = async () => {
      setIsWakingUpServer(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      try {
        const res = await fetch(`${API_URL}/api/health`);
        if (res.ok) {
          if (isMounted) {
            setServerAwake(true);
            setIsWakingUpServer(false);
          }
        } else {
          if (isMounted) setTimeout(checkHealth, 5000);
        }
      } catch (e) {
        if (isMounted) setTimeout(checkHealth, 5000);
      }
    };
    checkHealth();
    return () => { isMounted = false; };
  }, [sessionId, serverAwake]);

  useEffect(() => {
    if (sessionId && serverAwake) connectWebSocket();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      stopAudio();
    };
  }, [sessionId, serverAwake, connectWebSocket]);

  // ─── Actions ──────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || wsRef.current?.readyState !== WebSocket.OPEN) return;
      setMessages((prev) => [...prev, { role: "user", content, time: now() }]);
      setIsTyping(true);
      setStreamingText("");
      wsRef.current.send(JSON.stringify({ type: "message", content }));
    },
    [now]
  );

  const sendEndInterview = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end_interview" }));
      setIsTyping(true);
    }
  }, []);

  const changeLanguage = useCallback((lang: "en" | "ar" | "ar-eg") => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ type: "change_language", content: lang }));
  }, []);

  return {
    messages, isConnected, isTyping, isAiSpeaking, isListening, isWakingUpServer,
    questionCount, liveScores, telemetry, streamingText, sessionConfig, pendingAudio, setPendingAudio,
    sendMessage, sendEndInterview, changeLanguage,
    toggleListening, stopListening, stopCurrentAudio, setIsAiSpeaking, playAudio
  };
}
