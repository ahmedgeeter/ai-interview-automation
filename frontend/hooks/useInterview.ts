import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// --- Types ---
export interface Message { role: "ai" | "user" | "system"; content: string; time: string; isWarning?: boolean; }
export interface Telemetry { prompt: number; completion: number; latency: number; totalPrompt: number; totalCompletion: number; }
export interface LiveScores { technical: number; communication: number; problem_solving: number; }

// --- Hook ---
export function useInterview(sessionId: string, isVoiceMuted: boolean, voiceLang: "en" | "ar", onTranscriptChange: (t: string) => void) {
  const router = useRouter();
  
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [liveScores, setLiveScores] = useState<LiveScores | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry>({prompt: 0, completion: 0, latency: 0, totalPrompt: 0, totalCompletion: 0});

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const retryCount = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const now = useCallback(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), []);

  const playUISound = useCallback((type: "send" | "receive" | "alert") => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      if (type === "send") { osc.type="sine"; osc.frequency.setValueAtTime(660,ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(880,ctx.currentTime+0.08); g.gain.setValueAtTime(0.08,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.08); osc.start(); osc.stop(ctx.currentTime+0.08); }
      else if (type === "receive") { osc.type="sine"; osc.frequency.setValueAtTime(880,ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(660,ctx.currentTime+0.12); g.gain.setValueAtTime(0.08,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.12); osc.start(); osc.stop(ctx.currentTime+0.12); }
      else { osc.type="square"; osc.frequency.setValueAtTime(350,ctx.currentTime); g.gain.setValueAtTime(0.06,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.25); osc.start(); osc.stop(ctx.currentTime+0.25); }
    } catch {}
  }, []);

  // Speech Recognition Setup
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    
    const r = new SR();
    r.continuous = true; 
    r.interimResults = true;
    r.lang = voiceLang === "ar" ? "ar-EG" : "en-US";
    
    r.onstart = () => { setIsListening(true); isListeningRef.current = true; };
    r.onresult = (e: any) => { 
        let currentTranscript = "";
        for (let i = e.resultIndex; i < e.results.length; ++i) { 
            if (e.results[i].isFinal) currentTranscript += e.results[i][0].transcript + " "; 
        }
        if (currentTranscript) onTranscriptChange(currentTranscript);
    };
    r.onerror = (e: any) => { if (e.error === "not-allowed") { setIsListening(false); isListeningRef.current = false; } };
    r.onend = () => { 
        if (isListeningRef.current) { try { r.start(); } catch { setIsListening(false); isListeningRef.current = false; } } 
        else setIsListening(false);
    };
    recognitionRef.current = r;
  }, [voiceLang, onTranscriptChange]);

  const toggleListening = () => {
    if (isListening) { isListeningRef.current = false; recognitionRef.current?.stop(); }
    else { try { recognitionRef.current?.start(); } catch {} }
  };
  const stopListening = () => { isListeningRef.current = false; recognitionRef.current?.stop(); };

  // WebSocket Setup
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setIsTyping(true);
    const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "wss://ai-interview-automation.onrender.com";
    const ws = new WebSocket(`${WS_URL}/ws/${sessionId}`);
    wsRef.current = ws;
    
    ws.onopen = () => { setIsConnected(true); retryCount.current = 0; };
    ws.onmessage = (event) => {
      setIsTyping(false);
      const d = JSON.parse(event.data);
      if (d.type === "message") {
        playUISound(d.is_warning ? "alert" : "receive");
        setMessages(prev => [...prev, { role: d.is_warning ? "system" : "ai", content: d.content, time: now(), isWarning: d.is_warning }]);
        
        if (d.audio_base64 && !isVoiceMuted) {
          if (currentAudioRef.current) currentAudioRef.current.pause();
          const snd = new Audio("data:audio/mp3;base64," + d.audio_base64);
          currentAudioRef.current = snd;
          setIsAiSpeaking(true);
          snd.onended = () => setIsAiSpeaking(false);
          snd.play().catch(() => setIsAiSpeaking(false));
        }
        
        if (d.question_count) setQuestionCount(d.question_count);
      } else if (d.type === "evaluation_complete") {
        router.push(`/scorecard/${sessionId}`);
      } else if (d.type === "live_scores") {
        setLiveScores(d.scores);
      } else if (d.type === "telemetry") {
        setTelemetry(prev => ({
            prompt: d.prompt_tokens,
            completion: d.completion_tokens,
            latency: d.latency_ms,
            totalPrompt: prev.totalPrompt + d.prompt_tokens,
            totalCompletion: prev.totalCompletion + d.completion_tokens
        }));
      }
    };
    ws.onclose = () => {
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(() => { retryCount.current += 1; connectWebSocket(); }, Math.min(1000 * (2 ** retryCount.current), 30000));
    };
  }, [sessionId, isVoiceMuted, now, playUISound, router]);

  useEffect(() => {
    if (sessionId) connectWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (currentAudioRef.current) currentAudioRef.current.pause();
    };
  }, [sessionId, connectWebSocket]);

  // Actions
  const sendMessage = (content: string) => {
    if (!content.trim() || wsRef.current?.readyState !== WebSocket.OPEN) return;
    playUISound("send");
    setMessages(prev => [...prev, { role: "user", content, time: now() }]);
    setIsTyping(true);
    wsRef.current.send(JSON.stringify({ type: "message", content }));
  };
  const sendEndInterview = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end_interview" }));
      setIsTyping(true);
    }
  };
  const changeLanguage = (lang: "en" | "ar") => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: "change_language", content: lang }));
  };
  const stopCurrentAudio = () => { if (currentAudioRef.current) currentAudioRef.current.pause(); };

  return {
    messages, isConnected, isTyping, isAiSpeaking, isListening,
    questionCount, liveScores, telemetry,
    sendMessage, sendEndInterview, changeLanguage,
    toggleListening, stopListening, stopCurrentAudio, setIsAiSpeaking
  };
}
