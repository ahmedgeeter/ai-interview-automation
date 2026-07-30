"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useInterview } from "@/hooks/useInterview";
import { unlockAudioContext } from "@/lib/audioManager";
import {
  Mic, MicOff, Send, Volume2, VolumeX, Square, Moon, Sun,
  Globe, ChevronDown, Loader2, User, Bot, AlertTriangle,
  BarChart2, Zap, Timer, Activity, ChevronRight, Play
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
          <Bot className="w-3.5 h-3.5 text-white dark:text-stone-900" />
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
          {voiceLang === "ar"
            ? "انقر للدخول وتفعيل الصوت الآلي"
            : "Click to enter and enable AI voice playback"}
        </p>
        <button
          onClick={onEnter}
          className="w-full flex items-center justify-center gap-3 bg-slate-900 dark:bg-stone-100 hover:bg-slate-800 dark:hover:bg-stone-200 text-white dark:text-stone-900 font-bold py-4 rounded-xl transition-colors text-sm"
        >
          <Play className="w-4 h-4" />
          {voiceLang === "ar" ? "ادخل غرفة المقابلة" : "Enter Interview Room"}
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
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const {
    messages, isConnected, isTyping, isAiSpeaking, isListening, isWakingUpServer,
    questionCount, liveScores, telemetry, streamingText, sessionConfig,
    pendingAudio, setPendingAudio, playAudio,
    sendMessage, sendEndInterview, changeLanguage,
    toggleListening, stopListening, stopCurrentAudio, setIsAiSpeaking,
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

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;
    sendMessage(inputValue);
    setInputValue("");
    stopListening();
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [inputValue, sendMessage, stopListening]);

  // ── AUDIO UNLOCK ──────────────────────────────────────────────────────────────
  const handleEnterRoom = useCallback(async () => {
    // 1. Unlock the HTML5 Audio context
    await unlockAudioContext();
    // 2. Mark as unlocked
    setAudioUnlocked(true);
    // 3. Play any pending audio that arrived while waiting
    if (pendingAudio) {
      const audioToPlay = pendingAudio;
      setPendingAudio(null);
      setTimeout(() => {
        playAudio(audioToPlay);
      }, 50);
    }
  }, [pendingAudio, setPendingAudio, playAudio]);

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
            <button onClick={handleMuteToggle} className={`w-7 h-7 rounded border flex items-center justify-center transition-colors ${isVoiceMuted ? "border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 text-red-500" : "border-slate-200 dark:border-stone-800 text-slate-400 hover:bg-slate-100 dark:hover:bg-stone-800"}`}>
              {isVoiceMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <div className="relative">
              <button onClick={() => setShowLangMenu(!showLangMenu)} className="flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-stone-800 text-[11px] font-bold text-slate-600 dark:text-stone-400 hover:bg-slate-100 dark:hover:bg-stone-800 transition-colors">
                <Globe className="w-3 h-3" />
                {voiceLang === "en" ? "EN" : voiceLang === "ar-eg" ? "EG" : "AR"}
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
              {showLangMenu && (
                <div className="absolute top-full mt-1 end-0 bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 rounded-lg shadow-xl z-50 overflow-hidden min-w-[200px] p-1">
                  {renderLangOption("en", "English")}
                  {renderLangOption("ar", "عربي فصحى")}
                  {renderLangOption("ar-eg", "عربي مصري")}
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
            {isAiSpeaking && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-blue-600 dark:text-blue-400 text-[11px] font-bold">
                <Activity className="w-3 h-3 animate-pulse" />
                {voiceLang === "ar" ? "يتحدث" : "Speaking"}
              </div>
            )}
            {isTyping && !isAiSpeaking && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-stone-900 border border-slate-200 dark:border-stone-800 text-slate-500 text-[11px] font-bold">
                <Loader2 className="w-3 h-3 animate-spin" />
                {voiceLang === "ar" ? "يفكر..." : "Thinking..."}
              </div>
            )}
            <div className="text-[11px] font-mono text-slate-400 dark:text-stone-600">
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
                  ? (voiceLang === "ar" ? "جاري إيقاظ الذكاء الاصطناعي..." : "Waking up AI engine...")
                  : (voiceLang === "ar" ? "يجهّز أول سؤال..." : "Preparing first question...")}
              </p>
              {isWakingUpServer && (
                <p className="text-xs text-slate-400 dark:text-stone-500 max-w-[250px]">
                  {voiceLang === "ar" 
                    ? "الخادم في وضع السكون بسبب الخطة المجانية. قد يستغرق هذا حوالي 50 ثانية، يرجى الانتظار." 
                    : "Server is sleeping due to free tier. This may take ~50 seconds, please wait."}
                </p>
              )}
            </div>
          )}
          {messages.map((msg, i) => <MessageBubble key={i} msg={msg} isRtl={voiceLang.startsWith("ar")} />)}
          {streamingText && (
            <div className="flex items-end gap-2.5 justify-start">
              <div className="w-7 h-7 rounded-full bg-slate-900 dark:bg-stone-100 flex items-center justify-center shrink-0 mb-0.5">
                <Bot className="w-3.5 h-3.5 text-white dark:text-stone-900" />
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
                <Bot className="w-3.5 h-3.5 text-white dark:text-stone-900" />
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
          <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${isAiSpeaking ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40" : "bg-slate-50 dark:bg-stone-900/40 border-slate-100 dark:border-stone-800/50"}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isAiSpeaking ? "bg-blue-500 text-white" : "bg-slate-200 dark:bg-stone-800 text-slate-400 dark:text-stone-500"}`}>
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <div className={`text-xs font-bold ${isAiSpeaking ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-stone-500"}`}>
                {isAiSpeaking ? (voiceLang === "ar" ? "يتحدث الآن" : "Speaking") : isTyping ? (voiceLang === "ar" ? "يفكر..." : "Processing...") : (voiceLang === "ar" ? "جاهز" : "Ready")}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-stone-600 mt-0.5">
                {voiceLang === "en" ? "Charlie · Turbo EN" : voiceLang === "ar-eg" ? "Liam · Turbo EG" : "George · Turbo AR"}
              </div>
            </div>
          </div>
        </div>

        {/* Token telemetry */}
        <div className="p-5 border-b border-slate-200 dark:border-stone-800/60">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-stone-600 mb-3 flex items-center gap-1.5">
            <Zap className="w-3 h-3" /> Token Telemetry
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="bg-slate-50 dark:bg-stone-900/50 rounded-lg p-3 border border-slate-100 dark:border-stone-800/50">
              <div className="text-[9px] text-slate-400 dark:text-stone-600 font-bold uppercase mb-1">Prompt</div>
              <div className="text-sm font-mono font-bold text-slate-800 dark:text-stone-200">{telemetry.totalPrompt.toLocaleString()}</div>
              <div className="text-[9px] text-slate-400 dark:text-stone-600 mt-1">+{telemetry.prompt}</div>
            </div>
            <div className="bg-slate-50 dark:bg-stone-900/50 rounded-lg p-3 border border-slate-100 dark:border-stone-800/50">
              <div className="text-[9px] text-slate-400 dark:text-stone-600 font-bold uppercase mb-1">Completion</div>
              <div className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">{telemetry.totalCompletion.toLocaleString()}</div>
              <div className="text-[9px] text-slate-400 dark:text-stone-600 mt-1">+{telemetry.completion}</div>
            </div>
          </div>
          <div className="flex justify-between items-center bg-slate-50 dark:bg-stone-900/50 rounded-lg px-3 py-2.5 border border-slate-100 dark:border-stone-800/50">
            <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
              <Timer className="w-3 h-3" /> Latency
            </div>
            <div className={`text-sm font-mono font-bold ${telemetry.latency > 3000 ? "text-red-500" : telemetry.latency > 1500 ? "text-amber-500" : "text-emerald-500"}`}>
              {telemetry.latency > 0 ? `${telemetry.latency}ms` : "—"}
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
