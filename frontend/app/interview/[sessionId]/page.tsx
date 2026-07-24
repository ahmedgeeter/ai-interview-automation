"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Mic, MicOff, Square, Volume2, VolumeX, Activity, AlertTriangle, ChevronDown, Send, Languages, Moon, Sun } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";

export default function Home() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params?.sessionId as string;

  const [messages, setMessages] = useState<{ role: "ai" | "user" | "system"; content: string; time: string; isWarning?: boolean }[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [liveScores, setLiveScores] = useState<{technical: number, communication: number, problem_solving: number} | null>(null);
  const [telemetry, setTelemetry] = useState({prompt: 0, completion: 0, latency: 0, totalPrompt: 0, totalCompletion: 0});
  const [showVoiceLangMenu, setShowVoiceLangMenu] = useState(false);
  const [limitMode, setLimitMode] = useState<"time" | "questions">("questions");
  const [limitValue, setLimitValue] = useState(5);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [voiceLang, setVoiceLang] = useState<"en" | "ar">("en");

  const { locale, toggleLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();

  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const retryCount = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

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

  useEffect(() => {
    if (sessionId) {
      connectWebSocket(sessionId);
    }
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (currentAudioRef.current) currentAudioRef.current.pause();
    };
  }, [sessionId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true; r.interimResults = true;
    r.lang = voiceLang === "ar" ? "ar-EG" : "en-US";
    r.onstart = () => { setIsListening(true); isListeningRef.current = true; };
    r.onresult = (e: any) => { for (let i = e.resultIndex; i < e.results.length; ++i) { if (e.results[i].isFinal) setInputValue(prev => prev + e.results[i][0].transcript + " "); } };
    r.onerror = (e: any) => { if (e.error === "not-allowed") { setIsListening(false); isListeningRef.current = false; } };
    r.onend = () => { if (isListeningRef.current) { try { r.start(); } catch { setIsListening(false); isListeningRef.current = false; } } else setIsListening(false); };
    recognitionRef.current = r;
  }, [voiceLang]);

  const toggleListening = () => {
    if (isListening) { isListeningRef.current = false; recognitionRef.current?.stop(); }
    else { try { recognitionRef.current?.start(); } catch {} }
  };

  const connectWebSocket = (id: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setIsTyping(true);
    const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "wss://ai-interview-automation.onrender.com";
    const ws = new WebSocket(`${WS_URL}/ws/${id}`);
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
        router.push(`/scorecard/${id}`);
      } else if (d.type === "live_scores") {
        setLiveScores(d.scores);
      }
    };
    ws.onclose = () => {
      setIsConnected(false);
      const t = Math.min(1000 * (2 ** retryCount.current), 30000);
      reconnectTimeoutRef.current = setTimeout(() => { retryCount.current += 1; connectWebSocket(id); }, t);
    };
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isTyping]);

  const handleSend = () => {
    if (!inputValue.trim() || wsRef.current?.readyState !== WebSocket.OPEN) return;
    playUISound("send");
    if (isListeningRef.current) toggleListening();
    setMessages(prev => [...prev, { role: "user", content: inputValue, time: now() }]);
    setIsTyping(true);
    wsRef.current.send(JSON.stringify({ type: "message", content: inputValue }));
    setInputValue("");
  };

  const handleEnd = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end_interview" }));
      setIsTyping(true);
    }
  };

  const changeVoiceLang = (lang: "en" | "ar") => {
    setVoiceLang(lang);
    setShowVoiceLangMenu(false);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "change_language", content: lang }));
    }
  };

  const toggleTheme = () => {
    if (theme === "dark") setTheme("light");
    else if (theme === "light") setTheme("system");
    else setTheme("dark");
  };

  if (!sessionId) return null;
  const isRtl = locale === "ar";

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-stone-950 noise-bg text-slate-800 dark:text-stone-300 font-[family-name:var(--font-inter)] overflow-hidden" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex-1 flex flex-col relative">
        <header className="h-12 border-b border-slate-200 dark:border-stone-800/40 flex items-center justify-between px-5 shrink-0 bg-white/50 dark:bg-stone-950/50 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className="text-[11px] font-semibold text-slate-500 dark:text-stone-500">{isConnected ? t("uplink_on") : t("uplink_off")}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="flex items-center justify-center w-6 h-6 rounded border border-transparent hover:border-slate-200 dark:hover:border-stone-800 text-slate-400 dark:text-stone-500 transition-colors">
              {theme === "dark" ? <Moon className="w-3 h-3" /> : theme === "light" ? <Sun className="w-3 h-3" /> : <MonitorIcon className="w-3 h-3" />}
            </button>
            <button onClick={toggleLanguage} className="text-[11px] font-semibold text-slate-500 dark:text-stone-500 hover:text-slate-900 dark:hover:text-stone-200 transition-colors px-2 py-1 rounded border border-transparent hover:border-slate-200 dark:hover:border-stone-800">
              {locale === "en" ? "AR" : "EN"}
            </button>
            <div className="relative">
              <button onClick={() => setShowVoiceLangMenu(!showVoiceLangMenu)} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-stone-400 hover:text-slate-900 dark:hover:text-stone-200 transition-colors px-2 py-1 rounded border border-slate-200 dark:border-stone-800 bg-white dark:bg-stone-900/50">
                <Languages className="w-3.5 h-3.5" />
                {voiceLang === "en" ? "EN" : "AR"}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showVoiceLangMenu && (
                <div className="absolute top-full mt-1 end-0 bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 rounded-md shadow-xl z-50 min-w-[120px] overflow-hidden">
                  <button onClick={() => changeVoiceLang("en")} className="w-full text-start px-4 py-2 text-xs font-semibold flex items-center gap-2 text-slate-500 dark:text-stone-400 hover:bg-slate-50 dark:hover:bg-stone-800/50">English</button>
                  <button onClick={() => changeVoiceLang("ar")} className="w-full text-start px-4 py-2 text-xs font-semibold flex items-center gap-2 text-slate-500 dark:text-stone-400 hover:bg-slate-50 dark:hover:bg-stone-800/50">عربي</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto hide-scrollbar px-6 py-8 space-y-8 pb-32 scroll-smooth">
          {messages.map((msg, i) => (
            <div key={i} className="animate-fade-up">
              {msg.role === "ai" && (
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className="text-[11px] font-bold text-slate-900 dark:text-stone-200">{t("agent")}</span>
                    <span className="text-[10px] font-mono text-slate-400 dark:text-stone-600">{msg.time}</span>
                  </div>
                  <p className="text-[15px] text-slate-700 dark:text-stone-300 leading-relaxed font-medium" dir="auto"><TypewriterText text={msg.content} /></p>
                </div>
              )}
              {msg.role === "user" && (
                <div className="max-w-2xl ms-6 border-s-2 border-slate-200 dark:border-stone-800 ps-5">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-stone-400">{t("candidate")}</span>
                    <span className="text-[10px] font-mono text-slate-400 dark:text-stone-600">{msg.time}</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-stone-400 leading-relaxed" dir="auto">{msg.content}</p>
                </div>
              )}
            </div>
          ))}
          {isTyping && <div className="text-[10px] font-bold text-slate-400 dark:text-stone-600 animate-pulse">{t("processing")}</div>}
          <div ref={chatEndRef} />
        </main>
        <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-slate-50 via-slate-50/95 dark:from-stone-950 dark:via-stone-950/95 to-transparent">
          <div className="flex items-end bg-white dark:bg-stone-900/80 border border-slate-200 dark:border-stone-800 rounded-md shadow-sm">
            <textarea 
              value={inputValue} 
              onChange={e => { setInputValue(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }} 
              dir="auto"
              rows={1}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); e.currentTarget.style.height = 'auto'; } }}
              placeholder={isListening ? t("dictation_active") : t("input_placeholder")}
              className="flex-1 bg-transparent py-3.5 px-5 text-sm text-slate-900 dark:text-stone-50 focus:outline-none placeholder:text-slate-400 dark:placeholder:text-stone-600 resize-none overflow-y-auto" />
            <div className="flex items-center gap-1 pe-3 pb-2.5">
              <button onClick={toggleListening} className={`p-2 rounded-md ${isListening ? "text-slate-900 dark:text-stone-200 bg-slate-100 dark:bg-stone-800" : "text-slate-400 dark:text-stone-500 hover:text-slate-900 dark:hover:text-stone-200"}`}>
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button onClick={handleSend} className="p-2 rounded-md text-slate-400 dark:text-stone-500 hover:text-slate-900 dark:hover:text-stone-200 transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Controls Panel */}
      <div className="hidden lg:flex w-72 bg-white dark:bg-stone-900/20 flex-col border-s border-slate-200 dark:border-stone-800/40">

        {/* Session Info */}
        <div className="p-5 border-b border-slate-200 dark:border-stone-800/40">
          <div className="text-xs font-bold text-slate-900 dark:text-stone-200 mb-0.5">{jobTitle}</div>
          <div className="text-[10px] text-slate-500 dark:text-stone-500 font-mono">{sessionId.substring(0, 8).toUpperCase()}</div>
        </div>

        {/* Audio Visualizer */}
        <div className="p-5 border-b border-slate-200 dark:border-stone-800/40 flex flex-col items-center gap-4">
          <div className={`w-20 h-20 rounded-full border-2 flex items-center justify-center relative ${isAiSpeaking ? "border-slate-900 dark:border-stone-400" : "border-slate-200 dark:border-stone-800"}`}>
            {isAiSpeaking && <div className="absolute inset-0 rounded-full border-2 border-slate-900 dark:border-stone-400 animate-pulse-ring" />}
            <Volume2 className={`w-6 h-6 ${isAiSpeaking ? "text-slate-900 dark:text-stone-300" : "text-slate-300 dark:text-stone-700"}`} />
          </div>
          <span className="text-[10px] font-bold text-slate-400 dark:text-stone-600 uppercase">
            {isAiSpeaking ? (voiceLang === "ar" ? "يتحدث..." : "Speaking...") : (voiceLang === "ar" ? "صامت" : "Silent")}
          </span>
        </div>

        {/* SYSTEM INSPECTOR */}
        <div className="p-5 border-b border-slate-200 dark:border-stone-800/40">
          <h3 className="text-[10px] font-bold text-slate-400 dark:text-stone-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-emerald-500" />
            {locale === "ar" ? "مراقب النظام" : "System Inspector"}
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-slate-50 dark:bg-stone-950/50 rounded-md p-2.5 border border-slate-200 dark:border-stone-800">
              <div className="text-[9px] text-slate-400 dark:text-stone-500 font-bold uppercase mb-1">Prompt Tokens</div>
              <div className="text-sm font-mono text-slate-700 dark:text-stone-300">+{telemetry.prompt}</div>
              <div className="text-[9px] text-slate-400 dark:text-stone-500 mt-1 flex justify-between"><span>Total:</span> <span className="font-bold">{telemetry.totalPrompt}</span></div>
            </div>
            <div className="bg-slate-50 dark:bg-stone-950/50 rounded-md p-2.5 border border-slate-200 dark:border-stone-800">
              <div className="text-[9px] text-slate-400 dark:text-stone-500 font-bold uppercase mb-1">Completion Tokens</div>
              <div className="text-sm font-mono text-emerald-600 dark:text-emerald-400">+{telemetry.completion}</div>
              <div className="text-[9px] text-slate-400 dark:text-stone-500 mt-1 flex justify-between"><span>Total:</span> <span className="font-bold">{telemetry.totalCompletion}</span></div>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-stone-950/50 rounded-md p-2.5 border border-slate-200 dark:border-stone-800 flex justify-between items-center">
            <div className="text-[9px] text-slate-400 dark:text-stone-500 font-bold uppercase">Latency (TTFB)</div>
            <div className={`text-xs font-mono font-bold ${telemetry.latency > 2000 ? 'text-red-500' : 'text-emerald-500'}`}>{telemetry.latency}ms</div>
          </div>
        </div>

        {/* LIVE SCORES */}
        <div className="p-5 border-b border-slate-200 dark:border-stone-800/40 flex-1 overflow-y-auto">
          <h3 className="text-[10px] font-bold text-slate-400 dark:text-stone-500 uppercase tracking-wider mb-4">{locale === "ar" ? "التقييم اللحظي" : "Live Metrics"}</h3>
          {liveScores ? (
            <div className="space-y-4">
              {[
                { label: locale === "ar" ? "العمق التقني" : "Technical", val: liveScores.technical },
                { label: locale === "ar" ? "حل المشكلات" : "Problem Solving", val: liveScores.problem_solving },
                { label: locale === "ar" ? "التواصل" : "Communication", val: liveScores.communication },
              ].map((m, i) => (
                <div key={i}>
                  <div className="flex justify-between text-[10px] font-semibold text-slate-600 dark:text-stone-400 mb-1.5">
                    <span>{m.label}</span>
                    <span className="text-slate-900 dark:text-stone-200">{m.val}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-stone-800 rounded-full overflow-hidden" dir="ltr">
                    <div className="h-full bg-slate-400 dark:bg-stone-500 rounded-full transition-all duration-1000" style={{ width: `${m.val}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-400 dark:text-stone-600 text-center py-4 font-medium">
              {locale === "ar" ? "في انتظار البيانات..." : "Awaiting data..."}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-5 space-y-2">
          <button onClick={() => { setIsVoiceMuted(!isVoiceMuted); if (!isVoiceMuted && currentAudioRef.current) { currentAudioRef.current.pause(); setIsAiSpeaking(false); } }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-xs font-semibold transition-colors ${isVoiceMuted ? "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40" : "bg-white dark:bg-stone-900/50 text-slate-600 dark:text-stone-400 border border-slate-200 dark:border-stone-800 hover:text-slate-900 dark:hover:text-stone-200"}`}>
            {isVoiceMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            {isVoiceMuted ? t("agent_muted") : t("mute_agent")}
          </button>
          <button onClick={handleEnd}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-xs font-semibold bg-white dark:bg-stone-900/50 text-slate-600 dark:text-stone-400 border border-slate-200 dark:border-stone-800 hover:text-red-600 dark:hover:text-red-400 transition-colors">
            <Square className="w-4 h-4" />
            {t("end_session")}
          </button>
        </div>

        {/* Progress */}
        <div className="mt-auto p-5 border-t border-slate-200 dark:border-stone-800/40 bg-slate-50 dark:bg-transparent">
          <div className="flex justify-between text-[10px] font-bold text-slate-400 dark:text-stone-500 mb-2">
            <span>{t("interview_progress")}</span>
            <span className="text-slate-900 dark:text-stone-300">
              {limitMode === "time" && timeLeft !== null 
                ? `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}` 
                : `${questionCount}/${limitValue}`}
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-200 dark:bg-stone-800 rounded-full overflow-hidden" dir="ltr">
            <div className="h-full bg-slate-900 dark:bg-stone-400 rounded-full transition-all duration-1000" 
                 style={{ width: `${limitMode === "time" && timeLeft !== null ? Math.max(0, (timeLeft / (limitValue * 60)) * 100) : Math.min(100, Math.round((questionCount / limitValue) * 100))}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MonitorIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  )
}

function TypewriterText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    let i = 0;
    setDisplayed("");
    const interval = setInterval(() => {
      setDisplayed(text.substring(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, 25);
    return () => clearInterval(interval);
  }, [text]);
  return <span>{displayed}</span>;
}
