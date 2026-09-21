"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useInterview } from "@/hooks/useInterview";
import { unlockAudioContext, isAudioUnlocked } from "@/lib/audioManager";
import {
  Mic, MicOff, Send, Volume2, VolumeX, Square, Moon, Sun,
  Globe, ChevronDown, Loader2, User, UserCheck, AlertTriangle,
  BarChart2, Zap, Timer, Activity, ChevronRight, Play, Pause
} from "lucide-react";

// ─── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex gap-1.5 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-slate-300 dark:bg-stone-600 animate-bounce"
          style={{ animationDelay: `${i * 0.18}s`, animationDuration: "0.9s" }}
        />
      ))}
    </div>
  );
}

// ─── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, isRtl }: { msg: any; isRtl: boolean }) {
  if (msg.role === "system") {
    return (
      <div className="flex justify-center my-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 text-xs font-medium">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span dir={isRtl ? "rtl" : "ltr"}>{msg.content}</span>
        </div>
      </div>
    );
  }
  const isAi = msg.role === "ai";
  return (
    <div className={`flex items-end gap-2.5 ${isAi ? "justify-start" : "justify-end"}`}>
      {isAi && (
        <div className="w-7 h-7 rounded-full bg-slate-900 dark:bg-stone-100 flex items-center justify-center shrink-0 mb-0.5">
          <UserCheck className="w-3.5 h-3.5 text-white dark:text-stone-900" />
        </div>
      )}
      <div className="max-w-[80%] space-y-1">
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            isAi
              ? "bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 text-slate-800 dark:text-stone-200 rounded-bl-sm shadow-sm"
              : "bg-slate-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-br-sm"
          }`}
          dir={isRtl ? "rtl" : "ltr"}
        >
          {msg.content}
        </div>
        <div className={`text-[10px] text-slate-400 dark:text-stone-600 font-medium ${isAi ? "ps-1" : "pe-1 text-end"}`}>
          {msg.time}
        </div>
      </div>
      {!isAi && (
        <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mb-0.5">
          <User className="w-3.5 h-3.5 text-white" />
        </div>
      )}
    </div>
  );
}

// ─── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] font-bold text-slate-500 dark:text-stone-500 mb-1.5 uppercase tracking-wider">
        <span>{label}</span>
        <span className="font-mono text-slate-800 dark:text-stone-200">{value}%</span>
      </div>
      <div className="h-1 w-full bg-slate-100 dark:bg-stone-800 rounded-full overflow-hidden" dir="ltr">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ─── Audio Unlock Splash ───────────────────────────────────────────────────────
function AudioUnlockSplash({
  jobTitle,
  voiceLang,
  onEnter,
}: {
  jobTitle: string;
  voiceLang: string;
  onEnter: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-stone-950 flex flex-col items-center justify-center p-6 font-[family-name:var(--font-inter)]">
      <div className="max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-900 dark:bg-stone-100 flex items-center justify-center mx-auto mb-6">
          <Volume2 className="w-7 h-7 text-white dark:text-stone-900" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-stone-600 mb-2">
          Assessment Session
        </p>
        <h1 className="text-xl font-black text-slate-900 dark:text-stone-50 mb-2">{jobTitle}</h1>
        <p className="text-sm text-slate-500 dark:text-stone-400 mb-8 leading-relaxed">
          {voiceLang.startsWith("ar")
            ? `المحاور الصوتي: ${voiceLang === "ar-eg" ? "شاكر (قائد تقني مصري)" : "حامد (عربي فصحى)"} — انقر للدخول وبدء الجلسة الصوتية`
            : "Interviewer: Brian (Senior US Tech Lead) — Click to enter and enable audio playback"}
        </p>
        <button
          onClick={onEnter}
          className="w-full flex items-center justify-center gap-3 bg-slate-900 dark:bg-stone-100 hover:bg-slate-800 dark:hover:bg-stone-200 text-white dark:text-stone-900 font-bold py-4 rounded-xl transition-colors text-sm"
        >
          <Play className="w-4 h-4" />
          {voiceLang.startsWith("ar") ? "ادخل غرفة المقابلة" : "Enter Interview Room"}
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function InterviewPage() {
  const params = useParams();
  const sessionId = params?.sessionId as string;
  const { locale } = useLanguage();
  const { theme, setTheme } = useTheme();

  const [inputValue, setInputValue] = useState("");
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [voiceLang, setVoiceLang] = useState<"en" | "ar" | "ar-eg">("en");
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(() => isAudioUnlocked());

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const {
    messages, isConnected, isTyping, isAiSpeaking, isListening, isWakingUpServer,
    questionCount, liveScores, streamingText, sessionConfig,
    playAudio, flushAudioQueue, turnState,
    sendMessage, sendEndInterview, changeLanguage,
    toggleListening, stopListening, stopCurrentAudio, setIsAiSpeaking,
    isAudioPaused, pauseAudio, resumeAudio, togglePauseAudio,
  } = useInterview(sessionId, isVoiceMuted, voiceLang, (t) =>
    setInputValue((prev) => prev + t)
  );

  // Sync voice lang from config
  useEffect(() => {
    if (sessionConfig?.voice_lang) setVoiceLang(sessionConfig.voice_lang as "en" | "ar" | "ar-eg");
  }, [sessionConfig]);

  const jobTitle = sessionConfig?.job_title || "Technical Interview";
  const limitValue = sessionConfig?.limit_value || 5;
  const limitMode = sessionConfig?.limit_mode || "questions";
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (limitMode === "time" && audioUnlocked) setTimeLeft(limitValue * 60);
  }, [limitMode, limitValue, audioUnlocked]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) {
      if (timeLeft === 0) sendEndInterview();
      return;
    }
    const t = setTimeout(() => setTimeLeft((p) => (p !== null ? p - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, sendEndInterview]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, streamingText]);

  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const isRtl = locale === "ar";

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;
    setSilenceCountdown(null);
    sendMessage(inputValue);
    setInputValue("");
    stopListening();
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [inputValue, sendMessage, stopListening]);

  // Voice Activity Detection (VAD): 3-second visual countdown before auto-sending
  useEffect(() => {
    if (isListening && inputValue.trim()) {
      setSilenceCountdown(3);
      const interval = setInterval(() => {
        setSilenceCountdown((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(interval);
            handleSend();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setSilenceCountdown(null);
    }
  }, [inputValue, isListening, handleSend]);

  // ── AUDIO UNLOCK ──────────────────────────────────────────────────────────────
  const handleEnterRoom = useCallback(async () => {
    // 1. Unlock the HTML5 Audio context cleanly
    await unlockAudioContext();
    // 2. Mark as unlocked
    setAudioUnlocked(true);
    // 3. Immediately flush queued audio chunks sequentially
    flushAudioQueue();
  }, [flushAudioQueue]);

  const handleMuteToggle = () => {
    setIsVoiceMuted(!isVoiceMuted);
    if (!isVoiceMuted) { stopCurrentAudio(); setIsAiSpeaking(false); }
  };

  const toggleTheme = () => {
    if (theme === "dark") setTheme("light");
    else if (theme === "light") setTheme("system");
    else setTheme("dark");
  };

  const handleVoiceLangChange = (lang: "en" | "ar" | "ar-eg") => {
    setVoiceLang(lang);
    setShowLangMenu(false);
    changeLanguage(lang);
  };

  const handleTestVoice = async (e: React.MouseEvent, lang: "en" | "ar" | "ar-eg") => {
    e.stopPropagation();
    handleVoiceLangChange(lang);
    stopCurrentAudio();
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/api/test-voice?lang=${lang}`);
      const data = await res.json();
      if (data.audio_base64) {
        playAudio(data.audio_base64);
      }
    } catch (err) {
      console.error("Test voice failed", err);
    }
  };

  const handleStopVoice = (e: React.MouseEvent) => {
    e.stopPropagation();
    stopCurrentAudio();
    setIsAiSpeaking(false);
  };

  const renderLangOption = (langCode: "en" | "ar" | "ar-eg", label: string) => (
    <div className="flex items-center justify-between hover:bg-slate-50 dark:hover:bg-stone-800 px-2 py-1.5 rounded transition-colors group">
      <button 
        onClick={() => handleVoiceLangChange(langCode)} 
        className={`flex-1 text-start text-xs font-semibold ${voiceLang === langCode ? "text-slate-900 dark:text-stone-100" : "text-slate-400"}`}
      >
        {label}
      </button>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={(e) => handleTestVoice(e, langCode)} className="p-1.5 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded" title="Start Sample">
          <Play className="w-3.5 h-3.5 fill-current" />
        </button>
        <button onClick={handleStopVoice} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded" title="Stop Voice">
          <Square className="w-3.5 h-3.5 fill-current" />
        </button>
      </div>
    </div>
  );

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  if (!sessionId) return null;

  // Show splash until user interacts
  if (!audioUnlocked) {
    return (
      <AudioUnlockSplash
        jobTitle={jobTitle}
        voiceLang={voiceLang}
        onEnter={handleEnterRoom}
      />
    );
  }

  return (
    <div
      className="flex h-screen w-full bg-slate-50 dark:bg-stone-950 text-slate-800 dark:text-stone-200 font-[family-name:var(--font-inter)] overflow-hidden"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      {/* ── LEFT: Chat ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Nav bar */}
        <header className="h-11 border-b border-slate-200 dark:border-stone-800/60 flex items-center justify-between px-5 shrink-0 bg-white/80 dark:bg-stone-950/80 backdrop-blur-sm">
          <nav className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 dark:text-stone-600">
            <Link href="/" className="hover:text-slate-700 dark:hover:text-stone-300 transition-colors">AutoHire</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-700 dark:text-stone-300">Interview</span>
            <ChevronRight className="w-3 h-3" />
            <span className="font-mono text-[10px]">{sessionId.substring(0, 8).toUpperCase()}</span>
          </nav>
          <div className="flex items-center gap-1.5">
            <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase ${isConnected ? "text-emerald-600" : "text-red-500"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
              {isConnected ? "Live" : "Offline"}
            </div>

            {/* Audio Pause / Resume & Stop Header Controls */}
            {(isAiSpeaking || isAudioPaused) && (
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-stone-900 border border-slate-200 dark:border-stone-800 rounded-lg p-0.5 animate-fade-in">
                <button
                  onClick={isAudioPaused ? resumeAudio : pauseAudio}
                  title={
                    isAudioPaused
                      ? (voiceLang === "ar-eg" ? "استئناف صوت المحاور (شاكر)" : voiceLang === "ar" ? "استئناف صوت المحاور (حامد)" : "Resume Interviewer Voice (Charlie)")
                      : (voiceLang === "ar-eg" ? "إيقاف مؤقت لصوت شاكر" : voiceLang === "ar" ? "إيقاف مؤقت لصوت حامد" : "Pause Interviewer Voice (Charlie)")
                  }
                  aria-label={isAudioPaused ? "Resume Interviewer Voice" : "Pause Interviewer Voice"}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold transition-all ${
                    isAudioPaused
                      ? "bg-amber-500 hover:bg-amber-600 text-white shadow-sm animate-pulse"
                      : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                  }`}
                >
                  {isAudioPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3 fill-current" />}
                  <span>{isAudioPaused ? (voiceLang.startsWith("ar") ? "استئناف" : "Resume") : (voiceLang.startsWith("ar") ? "إيقاف مؤقت" : "Pause")}</span>
                </button>
                <button
                  onClick={stopCurrentAudio}
                  title={voiceLang.startsWith("ar") ? "إيقاف الصوت تماماً والانتقال للرد (Stop/Skip)" : "Stop Voice & Speak Now"}
                  aria-label="Stop Interviewer Voice"
                  className="p-1 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 rounded transition-colors"
                >
                  <Square className="w-3 h-3 fill-current" />
                </button>
              </div>
            )}

            <button onClick={handleMuteToggle} className={`w-7 h-7 rounded border flex items-center justify-center transition-colors ${isVoiceMuted ? "border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 text-red-500" : "border-slate-200 dark:border-stone-800 text-slate-400 hover:bg-slate-100 dark:hover:bg-stone-800"}`}>
              {isVoiceMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <div className="relative">
              <button onClick={() => setShowLangMenu(!showLangMenu)} className="flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-stone-800 text-[11px] font-bold text-slate-600 dark:text-stone-400 hover:bg-slate-100 dark:hover:bg-stone-800 transition-colors">
                <Globe className="w-3 h-3" />
                {voiceLang === "en" ? "EN (Charlie)" : voiceLang === "ar-eg" ? "EG (شاكر)" : "AR (حامد)"}
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
              {showLangMenu && (
                <div className="absolute top-full mt-1 end-0 bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 rounded-lg shadow-xl z-50 overflow-hidden min-w-[210px] p-1">
                  {renderLangOption("ar-eg", locale === "ar" ? "شاكر · مصري (Tech Lead)" : "Shakir · Egyptian Lead")}
                  {renderLangOption("ar", locale === "ar" ? "حامد · عربي فصحى" : "Hamed · Standard Arabic")}
                  {renderLangOption("en", locale === "ar" ? "تشارلي · إنجليزي تقني" : "Charlie · English Lead")}
                </div>
              )}
            </div>
            <button onClick={toggleTheme} className="w-7 h-7 rounded border border-slate-200 dark:border-stone-800 text-slate-400 hover:bg-slate-100 dark:hover:bg-stone-800 flex items-center justify-center transition-colors">
              {theme === "dark" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
            </button>
          </div>
        </header>

        {/* Session strip */}
        <div className="border-b border-slate-200 dark:border-stone-800/60 px-6 py-2.5 flex items-center justify-between shrink-0 bg-white/40 dark:bg-stone-950/40">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-stone-600">Assessment Session</div>
            <div className="text-sm font-bold text-slate-900 dark:text-stone-100 mt-0.5">{jobTitle}</div>
          </div>
          <div className="flex items-center gap-3">
            {turnState === "SPEAKING" && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-bold transition-all ${
                isAudioPaused
                  ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400"
                  : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/40 text-blue-600 dark:text-blue-400"
              }`}>
                {isAudioPaused ? (
                  <Pause className="w-3 h-3 text-amber-500" />
                ) : (
                  <div className="flex gap-0.5 items-end h-3">
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} className="w-1 bg-blue-500 rounded-sm animate-pulse" style={{ height: `${Math.random() * 60 + 40}%`, animationDuration: `${0.4 + i*0.1}s` }} />
                    ))}
                  </div>
                )}
                <span>
                  {isAudioPaused
                    ? (voiceLang.startsWith("ar") ? "الصوت متوقف مؤقتاً" : "Audio Paused")
                    : (voiceLang.startsWith("ar") ? "الذكاء الاصطناعي يتحدث" : "AI Speaking")}
                </span>
                <div className="flex items-center gap-1 ms-1 ps-1 border-s border-current/20">
                  <button
                    onClick={isAudioPaused ? resumeAudio : pauseAudio}
                    className="hover:opacity-80 transition-opacity p-0.5 rounded"
                    title={isAudioPaused ? "استئناف الصوت" : "إيقاف مؤقت للصوت"}
                  >
                    {isAudioPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3 fill-current" />}
                  </button>
                  <button
                    onClick={stopCurrentAudio}
                    className="hover:opacity-80 text-red-500 transition-opacity p-0.5 rounded"
                    title="إيقاف الصوت تماماً"
                  >
                    <Square className="w-2.5 h-2.5 fill-current" />
                  </button>
                </div>
              </div>
            )}
            {turnState === "LISTENING" && isListening && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">
                <div className="flex gap-0.5 items-end h-3">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="w-1 bg-emerald-500 rounded-sm animate-pulse" style={{ height: `${Math.random() * 60 + 40}%`, animationDuration: `${0.4 + i*0.1}s` }} />
                  ))}
                </div>
                {voiceLang === "ar" ? "يستمع لك..." : "Listening..."}
              </div>
            )}
            {turnState === "THINKING" && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-stone-900 border border-slate-200 dark:border-stone-800 text-slate-500 text-[11px] font-bold">
                <Loader2 className="w-3 h-3 animate-spin" />
                {voiceLang === "ar" ? "يفكر..." : "Thinking..."}
              </div>
            )}
            {turnState === "EVALUATING" && (
               <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/40 text-purple-600 dark:text-purple-400 text-[11px] font-bold">
               <Activity className="w-3 h-3 animate-bounce" />
               {voiceLang === "ar" ? "يقيّم..." : "Evaluating..."}
             </div>
            )}
            <div className="text-[11px] font-mono text-slate-400 dark:text-stone-600 ml-2">
              {limitMode === "time" && timeLeft !== null ? formatTime(timeLeft) : `Q ${questionCount} / ${limitValue}`}
            </div>
          </div>
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.length === 0 && !streamingText && (
            <div className="flex flex-col items-center justify-center h-full text-center pb-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
              <p className="text-sm font-bold text-slate-700 dark:text-stone-300 mb-2">
                {isWakingUpServer 
                  ? (voiceLang === "ar" ? "جاري تهيئة بيئة التقييم وتجهيز المحاور..." : "Initializing interview assessment environment...")
                  : (voiceLang === "ar" ? "جاري تجهيز السؤال الأول..." : "Preparing first technical question...")}
              </p>
              {isWakingUpServer && (
                <p className="text-xs text-slate-400 dark:text-stone-500 max-w-[280px]">
                  {voiceLang === "ar" 
                    ? "جاري مزامنة سياق التقييم وتحميل المعايير الهندسية، لحظات ونبدأ." 
                    : "Synchronizing assessment context and loading technical benchmarks. Ready in moments."}
                </p>
              )}
            </div>
          )}
          {messages.map((msg, i) => <MessageBubble key={i} msg={msg} isRtl={voiceLang.startsWith("ar")} />)}
          {streamingText && (
            <div className="flex items-end gap-2.5 justify-start">
              <div className="w-7 h-7 rounded-full bg-slate-900 dark:bg-stone-100 flex items-center justify-center shrink-0 mb-0.5">
                <UserCheck className="w-3.5 h-3.5 text-white dark:text-stone-900" />
              </div>
              <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-sm bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 text-slate-800 dark:text-stone-200 text-sm leading-relaxed shadow-sm" dir={voiceLang.startsWith("ar") ? "rtl" : "ltr"}>
                {streamingText}
                <span className="inline-block w-0.5 h-4 bg-slate-400 ms-0.5 animate-pulse align-text-bottom" />
              </div>
            </div>
          )}
          {isTyping && !streamingText && (
            <div className="flex items-end gap-2.5 justify-start">
              <div className="w-7 h-7 rounded-full bg-slate-900 dark:bg-stone-100 flex items-center justify-center shrink-0 mb-0.5">
                <UserCheck className="w-3.5 h-3.5 text-white dark:text-stone-900" />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 shadow-sm">
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-slate-200 dark:border-stone-800/60 bg-white/80 dark:bg-stone-950/80 backdrop-blur-sm p-4">
          {silenceCountdown !== null && silenceCountdown > 0 && (
            <div className="max-w-3xl mx-auto mb-3 px-3.5 py-2 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center justify-between shadow-sm animate-fade-up">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                <span>
                  {voiceLang.startsWith("ar")
                    ? `تم رصد التوقف عن التحدث: سيتم اعتماد الإجابة والإرسال تلقائياً خلال ${silenceCountdown} ثوانٍ...`
                    : `Speech silence detected: Auto-sending your response in ${silenceCountdown}s...`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSilenceCountdown(null)}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-stone-800 text-slate-700 dark:text-stone-300 hover:bg-slate-300 dark:hover:bg-stone-700 transition-colors font-medium"
                >
                  {voiceLang.startsWith("ar") ? "إلغاء التلقائي" : "Cancel"}
                </button>
                <button
                  onClick={handleSend}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-sm"
                >
                  {voiceLang.startsWith("ar") ? "إرسال فوراً" : "Send Now"}
                </button>
              </div>
            </div>
          )}
          <div className="flex items-end gap-3 max-w-3xl mx-auto">
            <button
              onClick={toggleListening}
              className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isListening ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25" : "bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 text-slate-400 hover:bg-slate-50 dark:hover:bg-stone-800"}`}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <div className="flex-1 flex items-end bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 rounded-xl shadow-sm overflow-hidden focus-within:border-slate-400 dark:focus-within:border-stone-600 transition-colors">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                dir="auto" rows={1}
                placeholder={isListening ? (voiceLang === "ar" ? "يستمع..." : "Listening...") : (voiceLang === "ar" ? "اكتب إجابتك..." : "Type your answer...")}
                className="flex-1 bg-transparent py-2.5 px-4 text-sm font-medium text-slate-900 dark:text-stone-100 focus:outline-none placeholder:text-slate-400 dark:placeholder:text-stone-600 resize-none max-h-[120px]"
              />
              <button onClick={handleSend} disabled={!inputValue.trim()} className="shrink-0 m-1.5 w-8 h-8 rounded-lg bg-slate-900 dark:bg-stone-200 text-white dark:text-stone-900 hover:bg-slate-800 dark:hover:bg-stone-300 disabled:opacity-30 flex items-center justify-center transition-all">
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Inspector ── */}
      <aside className="hidden lg:flex w-72 xl:w-80 flex-col border-s border-slate-200 dark:border-stone-800/60 bg-white/60 dark:bg-stone-950/60 backdrop-blur-sm shrink-0">
        {/* Agent status */}
        <div className="p-5 border-b border-slate-200 dark:border-stone-800/60">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-stone-600 mb-3">Agent Status</div>
          <div className={`p-3 rounded-xl border transition-all ${
            turnState === "SPEAKING"
              ? isAudioPaused
                ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40"
                : "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40 shadow-sm"
              : "bg-slate-50 dark:bg-stone-900/40 border-slate-100 dark:border-stone-800/50"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  turnState === "SPEAKING"
                    ? isAudioPaused ? "bg-amber-500 text-white" : "bg-blue-500 text-white"
                    : "bg-slate-200 dark:bg-stone-800 text-slate-400 dark:text-stone-500"
                }`}>
                  {isAudioPaused ? <Pause className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </div>
                <div>
                  <div className={`text-xs font-bold ${
                    turnState === "SPEAKING"
                      ? isAudioPaused ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"
                      : "text-slate-500 dark:text-stone-500"
                  }`}>
                    {turnState === "SPEAKING"
                      ? (isAudioPaused
                          ? (voiceLang.startsWith("ar") ? "متوقف مؤقتاً" : "Paused")
                          : (voiceLang.startsWith("ar") ? "يتحدث الآن" : "Speaking"))
                      : turnState === "THINKING"
                        ? (voiceLang.startsWith("ar") ? "يفكر..." : "Processing...")
                        : (voiceLang.startsWith("ar") ? "جاهز" : "Ready")}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-stone-600 mt-0.5 font-medium">
                    {voiceLang === "ar-eg"
                      ? "شاكر · مصري تقني (Shakir · Tech Lead)"
                      : voiceLang === "ar"
                      ? "حامد · عربي فصحى (Hamed · Arabic Lead)"
                      : "Charlie · English Lead"}
                  </div>
                </div>
              </div>

              {/* Action buttons if speaking or paused */}
              {(turnState === "SPEAKING" || isAiSpeaking || isAudioPaused) && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={isAudioPaused ? resumeAudio : pauseAudio}
                    className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all ${
                      isAudioPaused
                        ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-sm"
                        : "bg-white dark:bg-stone-800 hover:bg-slate-100 dark:hover:bg-stone-700 text-slate-700 dark:text-stone-300 border-slate-200 dark:border-stone-700"
                    }`}
                    title={isAudioPaused ? "استئناف" : "إيقاف مؤقت"}
                  >
                    {isAudioPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
                  </button>
                  <button
                    onClick={stopCurrentAudio}
                    className="p-1.5 rounded-lg border border-red-200 dark:border-red-900/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    title="إيقاف تماماً"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>



        {/* Live scores */}
        <div className="p-5 flex-1">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-stone-600 mb-4 flex items-center gap-1.5">
            <BarChart2 className="w-3 h-3" /> Live Assessment
          </div>
          {liveScores ? (
            <div className="space-y-4">
              <ScoreBar label="Technical" value={liveScores.technical} color="bg-blue-500" />
              <ScoreBar label="Problem Solving" value={liveScores.problem_solving} color="bg-purple-500" />
              <ScoreBar label="Communication" value={liveScores.communication} color="bg-emerald-500" />
            </div>
          ) : (
            <div className="h-20 flex items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-stone-800 text-slate-400 dark:text-stone-600">
              <span className="text-[11px] font-medium">Awaiting responses...</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-stone-800/60">
          <div className="mb-4">
            <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-stone-600 mb-2">
              <span>Progress</span>
              <span className="text-slate-700 dark:text-stone-300">
                {limitMode === "time" && timeLeft !== null ? formatTime(timeLeft) : `${questionCount} / ${limitValue}`}
              </span>
            </div>
            <div className="h-1 w-full bg-slate-200 dark:bg-stone-800 rounded-full overflow-hidden" dir="ltr">
              <div
                className="h-full bg-slate-800 dark:bg-stone-200 rounded-full transition-all duration-700"
                style={{
                  width: limitMode === "time" && timeLeft !== null
                    ? `${Math.max(0, (timeLeft / (limitValue * 60)) * 100)}%`
                    : `${Math.min(100, (questionCount / Math.max(limitValue, 1)) * 100)}%`,
                }}
              />
            </div>
          </div>
          <button
            onClick={sendEndInterview}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-stone-900 hover:bg-slate-800 text-xs font-bold transition-colors"
          >
            <Square className="w-3.5 h-3.5" />
            End Interview
          </button>
        </div>
      </aside>
    </div>
  );
}
