"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Square, Volume2, VolumeX, Briefcase, FileText, UploadCloud, Activity, AlertTriangle, Globe, ChevronDown, Send, Languages, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import FinalScorecard from "@/components/FinalScorecard";

export default function Home() {
  const router = useRouter();
  const [setupStep, setSetupStep] = useState(1);
  const [interviewMode, setInterviewMode] = useState<"standard" | "cv">("standard");
  const [jobTitle, setJobTitle] = useState("Senior AI Engineer");
  const [interviewFocus, setInterviewFocus] = useState("technical");
  const [persona, setPersona] = useState("balanced");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [voiceLang, setVoiceLang] = useState<"en" | "ar">("en");

  const [isBooting, setIsBooting] = useState(false);
  const [bootLogs, setBootLogs] = useState<string[]>([]);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionId, setSessionId] = useState("");

  const [messages, setMessages] = useState<{ role: "ai" | "user" | "system"; content: string; time: string; isWarning?: boolean }[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [cheatSignals, setCheatSignals] = useState(0);
  const [evaluationPayload, setEvaluationPayload] = useState<any>(null);
  const [liveScores, setLiveScores] = useState<{technical: number, communication: number, problem_solving: number} | null>(null);
  const [telemetry, setTelemetry] = useState({prompt: 0, completion: 0, latency: 0, totalPrompt: 0, totalCompletion: 0});
  const [showVoiceLangMenu, setShowVoiceLangMenu] = useState(false);
  const [limitMode, setLimitMode] = useState<"time" | "questions">("questions");
  const [limitValue, setLimitValue] = useState(5);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const { locale, toggleLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();

  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const retryCount = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMicPromptActive = useRef(false);

  const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // --- UI Sound ---
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

  // --- STT ---
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
    else { isMicPromptActive.current = true; try { recognitionRef.current?.start(); } catch {} setTimeout(() => { isMicPromptActive.current = false; }, 1000); }
  };

  // --- Boot Sequence ---
  const bootKeys: (keyof typeof import("../locales/en.json"))[] = ["boot_init", "boot_connect", "boot_search", "boot_llm", "boot_audio"];



  const startSession = async () => {
    try {
      setIsBooting(true);
      setBootLogs([t("boot_init")]);

      const logPromise = (async () => {
        for (const key of bootKeys.slice(1)) {
          await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
          setBootLogs(prev => [...prev, t(key as any)]);
        }
      })();

      let res;
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://ai-interview-automation.onrender.com";
      if (interviewMode === "cv" && cvFile) {
        const fd = new FormData();
        fd.append("job_title", jobTitle); fd.append("persona", persona); fd.append("interview_type", interviewFocus); fd.append("language", voiceLang); fd.append("cv_file", cvFile);
        fd.append("max_questions", (limitMode === "questions" ? limitValue : 999).toString());
        res = await fetch(`${API_URL}/api/start-session-cv`, { method: "POST", body: fd });
      } else {
        res = await fetch(`${API_URL}/api/start-session`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            job_title: jobTitle, 
            persona, 
            interview_type: interviewFocus, 
            language: voiceLang,
            max_questions: limitMode === "questions" ? limitValue : 999,
            max_time: limitMode === "time" ? limitValue : 999
          })
        });
      }
      const data = await res.json();
      await logPromise;

      setBootLogs(prev => [...prev, t("boot_done")]);
      await new Promise(r => setTimeout(r, 600));

      if (data.session_id) {
        setSessionId(data.session_id);
        setIsBooting(false);
        setSessionStarted(true);
        // Redirect to new route instead of loading inline
        router.push(`/interview/${data.session_id}`);
      }
    } catch {
        setBootLogs(prev => [...prev, t("boot_fail")]);
        setTimeout(() => setIsBooting(false), 2000);
    }
  };

  // --- WebSocket ---
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
      } else if (d.type === "audio_only") {
        if (d.audio_base64 && !isVoiceMuted) {
          if (currentAudioRef.current) currentAudioRef.current.pause();
          const snd = new Audio("data:audio/mp3;base64," + d.audio_base64);
          currentAudioRef.current = snd;
          setIsAiSpeaking(true);
          snd.onended = () => setIsAiSpeaking(false);
          snd.play().catch(() => setIsAiSpeaking(false));
        }
      } else if (d.type === "evaluation_complete") {
        setEvaluationPayload(d.payload);
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
      const t = Math.min(1000 * (2 ** retryCount.current), 30000);
      reconnectTimeoutRef.current = setTimeout(() => { retryCount.current += 1; connectWebSocket(id); }, t);
    };
  };

  // --- Tab Switch Detection ---
  useEffect(() => {
    const h = () => {
      // Disabled as per user request
      /*
      if (isMicPromptActive.current) return;
      if (document.hidden && sessionStarted && !evaluationPayload && wsRef.current?.readyState === WebSocket.OPEN) {
        setCheatSignals(p => p + 1);
        wsRef.current.send(JSON.stringify({ type: "tab_switch", content: "TAB_SWITCH_DETECTED" }));
        playUISound("alert");
      }
      */
    };
    // document.addEventListener("visibilitychange", h);
    return () => {
      // document.removeEventListener("visibilitychange", h);
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (currentAudioRef.current) currentAudioRef.current.pause();
    };
  }, [sessionStarted, evaluationPayload, playUISound]);
  // --- Timer Engine ---
  useEffect(() => {
    if (!sessionStarted || evaluationPayload || timeLeft === null) return;
    
    if (timeLeft <= 0) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "end_interview" }));
      }
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionStarted, evaluationPayload, timeLeft]);


  // --- Simulated Live Metrics Engine ---
  useEffect(() => {
    if (!messages.length) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'user') {
      const text = lastMsg.content.toLowerCase();
      setLiveScores(prev => {
        const p = prev || { technical: 30, communication: 30, problem_solving: 30 };
        let t = p.technical, c = p.communication, ps = p.problem_solving;
        
        if (text.length > 30) c = Math.min(95, c + 8);
        if (text.length > 100) c = Math.min(98, c + 15);
        
        const reasoningRegex = /(because|since|therefore|however|instead|لأن|بسبب|لكن|لذلك|وبالتالي|عن طريق)/g;
        const matches = text.match(reasoningRegex);
        if (matches) ps = Math.min(96, ps + (matches.length * 10));
        
        const techRegex = /(api|json|server|async|await|for|while|if|class|def|function|architecture|pattern|design|solid|database|sql|nosql|docker|aws|cloud|برمجة|دالة|خادم|تطبيق|تصميم|هندسة)/g;
        const techMatches = text.match(techRegex);
        if (techMatches) t = Math.min(98, t + (techMatches.length * 12));
        
        if (text.length < 15) {
            c = Math.max(20, c - 5);
            ps = Math.max(20, ps - 5);
        }
        
        return { technical: t, communication: c, problem_solving: ps };
      });
    }
  }, [messages]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isTyping]);

  // --- Send Message ---
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
    if (sessionStarted && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "change_language", content: lang }));
    }
  };

  const toggleTheme = () => {
    if (theme === "dark") setTheme("light");
    else if (theme === "light") setTheme("system");
    else setTheme("dark");
  };

  // =================== RENDER ===================

  if (evaluationPayload) {
    return <div className="min-h-screen bg-slate-50 dark:bg-stone-950 text-slate-900 dark:text-stone-50 font-[family-name:var(--font-inter)]"><FinalScorecard payload={evaluationPayload} jobTitle={jobTitle} /></div>;
  }

  // --- Boot Screen ---
  if (isBooting) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-stone-950 noise-bg flex items-end p-12 font-[family-name:var(--font-jetbrains-mono)]" dir="ltr">
        <div className="max-w-xl">
          {bootLogs.map((log, i) => (
            <div key={i} className="text-slate-600 dark:text-stone-400 text-sm mb-3 animate-fade-up font-medium" style={{ animationDelay: `${i * 0.1}s` }}>
              <span className="text-slate-900 dark:text-stone-100 mr-2">▸</span>{log}
            </div>
          ))}
          <div className="w-3 h-5 bg-slate-900 dark:bg-stone-100 animate-pulse mt-6" />
        </div>
      </div>
    );
  }

  // --- Setup / Wizard ---
  if (!sessionStarted) {
    const isRtl = locale === "ar";
    return (
      <div className={`min-h-screen bg-slate-50 dark:bg-stone-950 noise-bg text-slate-800 dark:text-stone-300 font-[family-name:var(--font-inter)] flex flex-col lg:flex-row`} dir={isRtl ? "rtl" : "ltr"}>

        {/* Left Branding Panel */}
        <div className="hidden lg:flex flex-col justify-between w-[45%] p-14 bg-white dark:bg-stone-900/40 relative overflow-hidden border-e border-slate-200 dark:border-stone-800/40 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
          <div>
            <div className="w-10 h-10 rounded-md bg-slate-900 dark:bg-stone-100 flex items-center justify-center mb-10 shadow-sm">
              <Activity className="w-5 h-5 text-white dark:text-stone-900" />
            </div>
            <h1 className="text-5xl font-black text-slate-900 dark:text-stone-50 tracking-tight leading-[1.15] mb-5">
              {locale === "ar" ? "نظام التقييم\nالذكي" : "Autonomous\nProctor"}
            </h1>
            <p className="text-slate-500 dark:text-stone-400 max-w-sm text-sm leading-relaxed font-medium">
              {locale === "ar"
                ? "ابدأ تقييم تقني احترافي مصمم خصيصاً لمجالك. يتكيف المحاور الذكي في الوقت الفعلي مع إجاباتك."
                : "Initialize a high-fidelity technical assessment tailored to your domain. The agent adapts in real-time, verifying depth and integrity."
              }
            </p>
          </div>
          <div className="text-[10px] font-mono text-slate-400 dark:text-stone-600 flex justify-between">
            <span>v3.0.0</span>
            <span>{locale === "ar" ? "في انتظار الإعدادات" : "STANDBY"}</span>
          </div>
        </div>

        {/* Right Setup Panel */}
        <div className="flex-1 flex flex-col min-h-screen overflow-y-auto">

          {/* Top Controls */}
          <div className="flex justify-end items-center gap-3 p-6">
            <button onClick={toggleTheme} className="flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 dark:border-stone-800 hover:bg-slate-100 dark:hover:bg-stone-800 text-slate-500 dark:text-stone-400 transition-colors">
              {theme === "dark" ? <Moon className="w-3.5 h-3.5" /> : theme === "light" ? <Sun className="w-3.5 h-3.5" /> : <MonitorIcon className="w-3.5 h-3.5" />}
            </button>
            <button onClick={toggleLanguage} className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-200 dark:border-stone-800 hover:bg-slate-100 dark:hover:bg-stone-800 text-xs font-bold text-slate-600 dark:text-stone-400 transition-colors">
              <Globe className="w-3.5 h-3.5" />
              {locale === "en" ? "العربية" : "English"}
            </button>
          </div>

          {/* Form Area */}
          <div className="flex-1 flex flex-col justify-center px-8 lg:px-16 max-w-xl mx-auto w-full pb-12">

            {/* Steps */}
            <div className="flex items-center gap-3 mb-10">
              {[1, 2, 3].map(s => (
                <div key={s} className={`h-1 rounded-full transition-all duration-500 ${s === setupStep ? "w-10 bg-slate-900 dark:bg-stone-200" : s < setupStep ? "w-6 bg-slate-400 dark:bg-stone-600" : "w-4 bg-slate-200 dark:bg-stone-800"}`} />
              ))}
              <span className="text-[11px] font-bold text-slate-400 dark:text-stone-500 ms-3">{t("seq")} {setupStep}/3</span>
            </div>

            {/* STEP 1 */}
            {setupStep === 1 && (
              <div className="animate-fade-up">
                <h2 className="text-xl font-bold text-slate-900 dark:text-stone-50 mb-6">{t("select_protocol")}</h2>
                <div className="space-y-3">
                  {([
                    { key: "standard" as const, icon: Briefcase, title: t("standard_mode"), desc: t("standard_desc") },
                    { key: "cv" as const, icon: FileText, title: t("cv_mode"), desc: t("cv_desc") },
                  ]).map(opt => (
                    <button key={opt.key} onClick={() => { setInterviewMode(opt.key); setSetupStep(2); }}
                      className={`w-full text-start p-5 rounded-md border transition-all flex items-start gap-4 ${interviewMode === opt.key ? "bg-slate-100 dark:bg-stone-900/50 border-slate-300 dark:border-stone-700 shadow-sm" : "bg-white dark:bg-stone-900/20 border-slate-200 dark:border-stone-800/80 hover:border-slate-300 dark:hover:border-stone-700"}`}>
                      <opt.icon className={`w-5 h-5 mt-0.5 shrink-0 ${interviewMode === opt.key ? "text-slate-900 dark:text-stone-200" : "text-slate-400 dark:text-stone-500"}`} />
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-stone-200 mb-0.5">{opt.title}</div>
                        <div className="text-xs text-slate-500 dark:text-stone-400 leading-relaxed">{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {setupStep === 2 && (
              <div className="animate-fade-up space-y-7">
                <h2 className="text-xl font-bold text-slate-900 dark:text-stone-50 mb-2">{t("configure")}</h2>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-stone-500 uppercase tracking-wider mb-2">{t("job_role")}</label>
                  <select value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                    className="w-full bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 rounded-md px-4 py-3 text-slate-900 dark:text-stone-200 text-sm focus:outline-none focus:border-slate-400 dark:focus:border-stone-600 transition-colors appearance-none cursor-pointer shadow-sm">
                    <optgroup label={locale === "ar" ? "الذكاء الاصطناعي" : "AI & ML"}>
                      <option value="Senior AI Engineer">Senior AI Engineer</option>
                      <option value="Junior AI Engineer">Junior AI Engineer</option>
                      <option value="Data Scientist">Data Scientist</option>
                      <option value="Machine Learning Ops">MLOps Engineer</option>
                    </optgroup>
                    <optgroup label={locale === "ar" ? "هندسة البرمجيات" : "Software Engineering"}>
                      <option value="Senior Frontend Engineer">Senior Frontend Engineer</option>
                      <option value="Senior Backend Engineer">Senior Backend Engineer</option>
                      <option value="Full Stack Engineer">Full Stack Engineer</option>
                      <option value="Staff Software Engineer">Staff Software Engineer</option>
                      <option value="Cloud Architect">Cloud Architect</option>
                      <option value="Cybersecurity Analyst">Cybersecurity Analyst</option>
                    </optgroup>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 dark:text-stone-500 uppercase tracking-wider mb-2">{t("focus")}</label>
                    <select value={interviewFocus} onChange={e => setInterviewFocus(e.target.value)}
                      className="w-full bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 rounded-md px-4 py-3 text-slate-900 dark:text-stone-200 text-sm focus:outline-none focus:border-slate-400 dark:focus:border-stone-600 transition-colors appearance-none cursor-pointer shadow-sm">
                      <option value="technical">{t("technical")}</option>
                      <option value="hr">{t("behavioral")}</option>
                      <option value="mixed">{t("mixed")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 dark:text-stone-500 uppercase tracking-wider mb-2">{t("persona_label")}</label>
                    <select value={persona} onChange={e => setPersona(e.target.value)}
                      className="w-full bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 rounded-md px-4 py-3 text-slate-900 dark:text-stone-200 text-sm focus:outline-none focus:border-slate-400 dark:focus:border-stone-600 transition-colors appearance-none cursor-pointer shadow-sm">
                      <option value="balanced">{t("balanced")}</option>
                      <option value="strict">{t("strict")}</option>
                      <option value="supportive">{t("supportive")}</option>
                    </select>
                  </div>
                </div>

                {/* Voice Language Selector (No Emoji) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-stone-500 uppercase tracking-wider mb-2">{t("voice_lang")}</label>
                  <div className="flex gap-2">
                    <button onClick={() => setVoiceLang("en")} className={`flex-1 py-3 rounded-md text-sm font-semibold transition-all ${voiceLang === "en" ? "bg-slate-900 dark:bg-stone-200 text-white dark:text-stone-900 shadow-sm" : "bg-white dark:bg-stone-900/50 border border-slate-200 dark:border-stone-800 text-slate-600 dark:text-stone-400 hover:text-slate-900 dark:hover:text-stone-200"}`}>
                      English
                    </button>
                    <button onClick={() => setVoiceLang("ar")} className={`flex-1 py-3 rounded-md text-sm font-semibold transition-all ${voiceLang === "ar" ? "bg-slate-900 dark:bg-stone-200 text-white dark:text-stone-900 shadow-sm" : "bg-white dark:bg-stone-900/50 border border-slate-200 dark:border-stone-800 text-slate-600 dark:text-stone-400 hover:text-slate-900 dark:hover:text-stone-200"}`}>
                      عربي
                    </button>
                  </div>
                </div>
                {/* Limit Settings */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-stone-500 uppercase tracking-wider mb-2">{t("limit_by")}</label>
                  <div className="flex gap-2 mb-3">
                    <button onClick={() => { setLimitMode("questions"); setLimitValue(5); }} className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${limitMode === "questions" ? "bg-slate-900 dark:bg-stone-200 text-white dark:text-stone-900 shadow-sm" : "bg-white dark:bg-stone-900/50 border border-slate-200 dark:border-stone-800 text-slate-600 dark:text-stone-400 hover:text-slate-900 dark:hover:text-stone-200"}`}>
                      {t("questions")}
                    </button>
                    <button onClick={() => { setLimitMode("time"); setLimitValue(15); }} className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${limitMode === "time" ? "bg-slate-900 dark:bg-stone-200 text-white dark:text-stone-900 shadow-sm" : "bg-white dark:bg-stone-900/50 border border-slate-200 dark:border-stone-800 text-slate-600 dark:text-stone-400 hover:text-slate-900 dark:hover:text-stone-200"}`}>
                      {t("time")}
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    <input 
                      type="range" 
                      min="1" 
                      max={limitMode === "time" ? "60" : "100"} 
                      value={limitValue} 
                      onChange={e => setLimitValue(Number(e.target.value))} 
                      className="flex-1 accent-slate-900 dark:accent-stone-200"
                    />
                    <div className="text-sm font-bold text-slate-900 dark:text-stone-200 min-w-[4rem] text-right">
                      {limitValue} {limitMode === "time" ? t("minutes") : t("questions")}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3 */}
            {setupStep === 3 && (
              <div className="animate-fade-up">
                <h2 className="text-xl font-bold text-slate-900 dark:text-stone-50 mb-6">{t("initialize")}</h2>
                {interviewMode === "cv" ? (
                  <label className="block border-2 border-dashed border-slate-300 dark:border-stone-700 rounded-md bg-slate-50 dark:bg-stone-900/30 p-10 text-center cursor-pointer hover:border-slate-400 dark:hover:border-stone-600 transition-colors relative">
                    <input type="file" accept=".pdf,.doc,.docx" onChange={e => setCvFile(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <UploadCloud className="w-8 h-8 text-slate-400 dark:text-stone-600 mx-auto mb-3" />
                    <div className="text-sm font-semibold text-slate-900 dark:text-stone-200 mb-1">{cvFile ? cvFile.name : t("upload_cv")}</div>
                    <div className="text-xs text-slate-500 dark:text-stone-500">{t("upload_cv_hint")}</div>
                  </label>
                ) : (
                  <div className="bg-white dark:bg-stone-900/30 border border-slate-200 dark:border-stone-800 rounded-md p-8 shadow-sm">
                    <div className="text-sm font-semibold text-slate-900 dark:text-stone-200 mb-1">{t("system_ready")}</div>
                    <p className="text-xs text-slate-500 dark:text-stone-400 leading-relaxed">{t("system_ready_desc")} — <span className="text-slate-900 dark:text-stone-300 font-semibold">{jobTitle}</span></p>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between items-center mt-10 pt-6 border-t border-slate-200 dark:border-stone-800/50">
              <button onClick={() => setSetupStep(p => Math.max(1, p - 1))}
                className={`text-xs font-semibold text-slate-500 dark:text-stone-500 hover:text-slate-900 dark:hover:text-stone-200 transition-colors ${setupStep === 1 ? "invisible" : ""}`}>
                ← {t("back")}
              </button>
              {setupStep < 3 ? (
                <button onClick={() => setSetupStep(p => p + 1)} className="bg-slate-900 dark:bg-stone-200 hover:bg-slate-800 dark:hover:bg-stone-300 text-white dark:text-stone-900 px-6 py-2.5 rounded-md text-sm font-semibold transition-colors shadow-sm">
                  {t("continue")} →
                </button>
              ) : (
                <button onClick={startSession} disabled={interviewMode === "cv" && !cvFile}
                  className="bg-slate-900 dark:bg-stone-200 hover:bg-slate-800 dark:hover:bg-stone-300 text-white dark:text-stone-900 px-8 py-2.5 rounded-md text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm">
                  {t("execute")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =================== INTERVIEW ROOM (Migrated to /interview/[sessionId]) ===================
  return null;
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
