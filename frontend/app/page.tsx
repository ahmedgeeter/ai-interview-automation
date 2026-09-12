"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase, FileText, UploadCloud, Globe, Moon, Sun,
  ArrowRight, ArrowLeft, ChevronRight, CheckCircle2, Sparkles,
  Volume2, ShieldCheck, Zap, Sliders, Play, Square,
  Cpu, Terminal, Layers, Clock, AlertCircle, FileCheck, Check, Users, ShieldAlert, Code2, RefreshCw
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { unlockAudioContext } from "@/lib/audioManager";

const JOB_ROLES = [
  {
    group: "AI & Machine Learning",
    roles: ["Senior AI Engineer", "Junior AI Engineer", "Data Scientist", "MLOps Engineer", "Computer Vision Engineer", "NLP Engineer"]
  },
  {
    group: "Software & Architecture",
    roles: ["Senior Backend Engineer", "Senior Frontend Engineer", "Full Stack Engineer", "Staff Software Engineer", "Cloud Architect", "DevOps Engineer", "Cybersecurity Analyst"]
  },
  {
    group: "Data & Systems",
    roles: ["Data Engineer", "Distributed Systems Engineer", "Analytics Engineer", "Database Administrator"]
  },
];

const POPULAR_CHIPS = [
  "Senior AI Engineer",
  "Senior Backend Engineer",
  "Full Stack Engineer",
  "MLOps Engineer",
  "Cloud Architect"
];

const PERSONAS = [
  {
    value: "balanced",
    labelEn: "Balanced Tech Lead",
    labelAr: "قائد تقني متوازن",
    descEn: "Realistic senior engineering manager. Fair, contextual, and probes trade-offs.",
    descAr: "أسلوب واقعي واحترافي، يركز على المفاضلات الهندسية (Trade-offs) وعمق الأنظمة.",
    iconType: "balanced"
  },
  {
    value: "strict",
    labelEn: "Strict FAANG Lead",
    labelAr: "مقابلة دقيقة (FAANG)",
    descEn: "High-rigor, fast-paced assessment focusing on edge cases, latency & bottlenecks.",
    descAr: "أسئلة ضاغطة ومكثفة، تفحص الحالات الحرجة (Edge cases) ونقاط الاختناق.",
    iconType: "strict"
  },
  {
    value: "supportive",
    labelEn: "Supportive Mentor",
    labelAr: "مرشد توجيهي وداعم",
    descEn: "Collaborative and guiding style to bring out your best architectural reasoning.",
    descAr: "أسلوب تشاركي وداعم يساعدك على شرح طريقة تفكيرك وحل المشكلات المعقدة.",
    iconType: "supportive"
  },
];

const VOICES = [
  {
    code: "ar-eg" as const,
    label: "Egyptian Arabic",
    labelAr: "مصري تقني أصيل",
    voiceName: "Shakir · Egyptian Tech Lead",
    badge: "Recommended",
    badgeAr: "موصى به"
  },
  {
    code: "ar" as const,
    label: "Modern Standard Arabic",
    labelAr: "عربي فصحى",
    voiceName: "George / Hamed · Arabic",
    badge: "Standard",
    badgeAr: "معياري"
  },
  {
    code: "en" as const,
    label: "Technical English",
    labelAr: "إنجليزي تقني",
    voiceName: "Charlie · English",
    badge: "International",
    badgeAr: "دولي"
  }
];

export default function SetupPage() {
  const router = useRouter();
  const { locale, toggleLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"standard" | "cv">("standard");
  const [jobTitle, setJobTitle] = useState("Senior AI Engineer");
  const [customJob, setCustomJob] = useState("");
  const [useCustomJob, setUseCustomJob] = useState(false);
  const [focus, setFocus] = useState("technical");
  const [persona, setPersona] = useState("balanced");
  const [voiceLang, setVoiceLang] = useState<"en" | "ar" | "ar-eg">("ar-eg");
  const [limitMode, setLimitMode] = useState<"questions" | "time">("questions");
  const [limitValue, setLimitValue] = useState(5);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvDragging, setCvDragging] = useState(false);
  
  // Audio sample preview
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Boot telemetry animation
  const [isBooting, setIsBooting] = useState(false);
  const [bootLog, setBootLog] = useState<string[]>([]);
  const [bootProgress, setBootProgress] = useState(0);
  const [bootError, setBootError] = useState<string | null>(null);
  const bootAbortRef = useRef<AbortController | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const isRtl = locale === "ar";
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Pre-warm backend connection on landing
  useEffect(() => {
    fetch(`${API_URL}/api/health`).catch(() => {});
  }, [API_URL]);

  const addLog = (msg: string) => setBootLog(p => [...p, msg]);

  // Handle Voice Sample Testing
  const handleTestVoice = async (langCode: "en" | "ar" | "ar-eg") => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (playingVoice === langCode) {
      setPlayingVoice(null);
      return;
    }

    try {
      setPlayingVoice(langCode);
      const res = await fetch(`${API_URL}/api/test-voice?lang=${langCode}`);
      const data = await res.json();
      if (data.audio_base64) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audio_base64}`);
        previewAudioRef.current = audio;
        audio.onended = () => setPlayingVoice(null);
        audio.onerror = () => setPlayingVoice(null);
        await audio.play();
      } else {
        setPlayingVoice(null);
      }
    } catch {
      setPlayingVoice(null);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setCvDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".pdf") || file.name.endsWith(".docx") || file.name.endsWith(".txt")) {
        setCvFile(file);
      }
    }
  };

  const startSession = async () => {
    // Pre-unlock Web Audio context on user button click gesture
    unlockAudioContext().catch(() => {});

    setIsBooting(true);
    setBootError(null);
    setBootLog([]);
    setBootProgress(20);

    const abortCtrl = new AbortController();
    bootAbortRef.current = abortCtrl;
    const abortTimeout = setTimeout(() => {
      abortCtrl.abort();
    }, 28000); // 28s network safety ceiling

    let progressTimer: NodeJS.Timeout | null = null;
    let elapsedTimer1: NodeJS.Timeout | null = null;
    let elapsedTimer2: NodeJS.Timeout | null = null;

    try {
      addLog(isRtl ? "تهيئة بيئة المقابلة المخصصة..." : "Initializing session environment...");
      const effectiveJob = useCustomJob && customJob.trim() ? customJob.trim() : jobTitle;

      await new Promise(r => setTimeout(r, 200));
      setBootProgress(36);
      addLog(isRtl ? "تجهيز معايير التقييم والأسئلة التقنية..." : "Preparing assessment questions & criteria...");

      // Dynamic smooth progress ticker while backend processes request
      let currentProgress = 36;
      progressTimer = setInterval(() => {
        currentProgress = Math.min(currentProgress + 2, 72);
        setBootProgress(currentProgress);
      }, 250);

      // Contextual status updates if cloud container is cold-booting
      elapsedTimer1 = setTimeout(() => {
        addLog(isRtl ? "جاري تدقيق السيناريوهات الهندسية مع السيرفر..." : "Calibrating scenario blueprints...");
      }, 2500);

      elapsedTimer2 = setTimeout(() => {
        addLog(isRtl ? "السيرفر السحابي يستيقظ، يرجى الانتظار ثوانٍ معدودة..." : "Synchronizing cloud server instance, please wait...");
      }, 6000);

      let res: Response;
      if (mode === "cv" && cvFile) {
        const fd = new FormData();
        fd.append("job_title", effectiveJob);
        fd.append("persona", persona);
        fd.append("interview_type", focus);
        fd.append("language", voiceLang);
        fd.append("limit_mode", limitMode);
        fd.append("limit_value", limitValue.toString());
        fd.append("max_questions", limitMode === "questions" ? limitValue.toString() : "999");
        fd.append("cv_file", cvFile);
        res = await fetch(`${API_URL}/api/start-session-cv`, {
          method: "POST",
          body: fd,
          signal: abortCtrl.signal,
        });
      } else {
        res = await fetch(`${API_URL}/api/start-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortCtrl.signal,
          body: JSON.stringify({
            job_title: effectiveJob,
            persona,
            interview_type: focus,
            language: voiceLang,
            limit_mode: limitMode,
            limit_value: limitValue,
            max_questions: limitMode === "questions" ? limitValue : 999,
          }),
        });
      }

      if (progressTimer) clearInterval(progressTimer);
      if (elapsedTimer1) clearTimeout(elapsedTimer1);
      if (elapsedTimer2) clearTimeout(elapsedTimer2);
      clearTimeout(abortTimeout);

      if (!res.ok) {
        let errDetail = `Server returned ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.detail) errDetail = errData.detail;
        } catch {}
        throw new Error(errDetail);
      }

      setBootProgress(82);
      const data = await res.json();
      if (!data.session_id) throw new Error(data.detail || "No session ID returned");

      addLog(isRtl ? "فحص إعدادات الصوت وقنوات الاتصال..." : "Configuring audio channels & connection...");
      await new Promise(r => setTimeout(r, 200));
      setBootProgress(94);

      addLog(isRtl ? "اكتمل الإعداد بنجاح — جاري دخول قاعة المقابلة..." : "Ready. Entering interview room...");
      await new Promise(r => setTimeout(r, 300));
      setBootProgress(100);

      router.push(`/interview/${data.session_id}`);
    } catch (e: any) {
      if (progressTimer) clearInterval(progressTimer);
      if (elapsedTimer1) clearTimeout(elapsedTimer1);
      if (elapsedTimer2) clearTimeout(elapsedTimer2);
      clearTimeout(abortTimeout);

      const isAbort = e.name === "AbortError";
      const errorMsg = isAbort
        ? (isRtl ? "استغرق السيرفر وقتاً طويلاً للاستجابة. اضغط أدناه لإعادة المحاولة فوراً." : "Connection timed out. Click retry to connect now.")
        : (e.message || (isRtl ? "تعذر الاتصال بالسيرفر" : "Connection failed"));

      setBootError(errorMsg);
      addLog(isRtl ? `تنبيه: ${errorMsg}` : `Notice: ${errorMsg}`);
    }
  };

  // Booting Telemetry Screen
  if (isBooting) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col items-center justify-center p-6 relative overflow-hidden" dir="ltr">
        <div className="ambient-glow w-96 h-96 bg-indigo-600/20 top-1/4 left-1/3" />
        <div className="ambient-glow w-80 h-80 bg-violet-600/15 bottom-1/4 right-1/3" />

        <div className="max-w-md w-full glass-panel rounded-2xl p-8 border border-white/10 shadow-2xl relative z-10 animate-fade-up">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">AutoHire</h3>
                <p className="text-[11px] text-zinc-400">
                  {bootError
                    ? (isRtl ? "حدث خطأ أثناء الإعداد" : "Setup Paused")
                    : (isRtl ? "جاري تجهيز المقابلة" : "Preparing Session")}
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-indigo-400">{bootProgress}%</span>
          </div>

          {/* Progress Bar */}
          <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden mb-6 relative">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                bootError
                  ? "bg-amber-500"
                  : "bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-400"
              }`}
              style={{ width: `${bootProgress}%` }}
            />
          </div>

          {/* Terminal Matrix Log */}
          <div className="bg-black/60 rounded-xl p-4 border border-white/5 font-mono text-xs space-y-2 min-h-[140px] flex flex-col justify-end overflow-hidden">
            {bootLog.map((log, idx) => (
              <div key={idx} className="flex items-start gap-2 text-zinc-300 animate-fade-up">
                <span className="text-indigo-400 select-none">›</span>
                <span>{log}</span>
              </div>
            ))}
            {!bootError && (
              <div className="flex items-center gap-2 text-indigo-400">
                <span className="animate-pulse">_</span>
              </div>
            )}
          </div>

          {/* Error Actions or Cancel Link */}
          {bootError ? (
            <div className="mt-6 flex flex-col gap-2 animate-fade-up">
              <button
                onClick={startSession}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {isRtl ? "إعادة المحاولة الآن" : "Retry Now"}
              </button>
              <button
                onClick={() => {
                  bootAbortRef.current?.abort();
                  setIsBooting(false);
                  setBootError(null);
                }}
                className="w-full py-2 px-4 text-xs text-zinc-400 hover:text-white transition-colors"
              >
                {isRtl ? "إلغاء والعودة للإعدادات" : "Cancel and Return to Setup"}
              </button>
            </div>
          ) : (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => {
                  bootAbortRef.current?.abort();
                  setIsBooting(false);
                }}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {isRtl ? "إلغاء والعودة" : "Cancel and return"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 font-[family-name:var(--font-inter)] transition-colors duration-200 relative overflow-hidden`} dir={isRtl ? "rtl" : "ltr"}>
      
      {/* Dynamic Ambient Background Glows */}
      <div className="ambient-glow w-[500px] h-[500px] bg-indigo-500/10 dark:bg-indigo-600/15 top-[-100px] right-[-100px]" />
      <div className="ambient-glow w-[600px] h-[600px] bg-violet-500/10 dark:bg-violet-600/10 bottom-[-150px] left-[-150px]" />

      {/* ── Top Navigation Bar ── */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-white/5 bg-white/70 dark:bg-[#09090b]/70 backdrop-blur-xl px-6 py-3.5 transition-colors">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white">AutoHire</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 hidden sm:block">
              {isRtl ? "منصة المقابلات والتقييم التقني" : "Technical Interview Assessment Platform"}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
            >
              <Globe className="w-3.5 h-3.5 text-indigo-500" />
              <span>{locale === "en" ? "عربي" : "English"}</span>
            </button>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center transition-all"
              aria-label="Toggle Theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Setup Container ── */}
      <main className="max-w-4xl mx-auto px-6 py-10 relative z-10">

        {/* Hero Section */}
        <div className="text-center max-w-2xl mx-auto mb-10 animate-fade-up">
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight mb-3">
            {isRtl ? "إعداد المقابلة التقنية" : "Technical Interview Assessment"}
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-zinc-400 leading-relaxed">
            {isRtl
              ? "اختر تخصصك وارفع سيرتك الذاتية لبدء تقييم عملي تفاعلي يحاكي المقابلات التقنية الحقيقية."
              : "Select your role and upload your resume for an interactive assessment tailored to your technical stack."}
          </p>
        </div>

        {/* Progress Step Indicator */}
        <div className="flex items-center justify-center gap-3 mb-10 max-w-md mx-auto">
          {[
            { s: 1, label: isRtl ? "نوع التقييم" : "Mode" },
            { s: 2, label: isRtl ? "المسمى والمهارات" : "Role & Stack" },
            { s: 3, label: isRtl ? "المحاور والصوت" : "Persona & Voice" },
          ].map((item, idx) => (
            <React.Fragment key={item.s}>
              <button
                onClick={() => { if (item.s < step) setStep(item.s); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  step === item.s
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 ring-2 ring-indigo-500/30"
                    : step > item.s
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-zinc-500"
                }`}
              >
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] bg-black/20">
                  {step > item.s ? <Check className="w-2.5 h-2.5" /> : item.s}
                </span>
                <span>{item.label}</span>
              </button>
              {idx < 2 && (
                <div className={`w-8 h-0.5 rounded-full transition-colors ${step > item.s ? "bg-emerald-500/40" : "bg-slate-200 dark:bg-zinc-800"}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* ── STEP 1: Assessment Mode ── */}
        {step === 1 && (
          <div className="space-y-4 animate-fade-up max-w-2xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Option 1: Standard Assessment */}
              <div
                onClick={() => { setMode("standard"); }}
                className={`glass-card p-6 rounded-2xl cursor-pointer relative group ${
                  mode === "standard"
                    ? "ring-2 ring-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-300 dark:border-indigo-700/50"
                    : "hover:border-slate-300 dark:hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                    mode === "standard" ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-zinc-300"
                  }`}>
                    <Code2 className="w-6 h-6" />
                  </div>
                  {mode === "standard" && (
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1.5">
                  {isRtl ? "تقييم معياري للدور" : "Standard Role Assessment"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed mb-4">
                  {isRtl
                    ? "أسئلة تقنية متقدمة مبنية على أحدث المعايير الهندسية في السوق لهذا التخصص."
                    : "Technical questions curated from current industry standards for your selected engineering role."}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100/60 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                    {isRtl ? "معايير متقدمة" : "Industry Standards"}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-zinc-400">
                    {isRtl ? "معمارية أنظمة" : "System Design"}
                  </span>
                </div>
              </div>

              {/* Option 2: CV Tailored */}
              <div
                onClick={() => { setMode("cv"); }}
                className={`glass-card p-6 rounded-2xl cursor-pointer relative group ${
                  mode === "cv"
                    ? "ring-2 ring-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-300 dark:border-indigo-700/50"
                    : "hover:border-slate-300 dark:hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                    mode === "cv" ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-zinc-300"
                  }`}>
                    <FileText className="w-6 h-6" />
                  </div>
                  {mode === "cv" && (
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1.5">
                  {isRtl ? "تقييم مخصص للسيرة الذاتية" : "CV-Tailored Deep Dive"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed mb-4">
                  {isRtl
                    ? "تحليل مشاريعك وخبراتك الفعلية في السيرة الذاتية مع أسئلة متعمقة حول ما قمت ببنائه."
                    : "Personalized questions based on your projects, tech stack, and practical experience."}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-100/60 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                    {isRtl ? "تحليل السيرة الذاتية" : "Resume Analysis"}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-zinc-400">
                    {isRtl ? "مناقشة المشاريع" : "Project Deep Dive"}
                  </span>
                </div>
              </div>
            </div>

            {/* CV Dropzone if Mode is CV */}
            {mode === "cv" && (
              <div
                onDragOver={(e) => { e.preventDefault(); setCvDragging(true); }}
                onDragLeave={() => setCvDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                  cvDragging
                    ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 scale-[1.01]"
                    : cvFile
                    ? "border-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-950/10"
                    : "border-slate-300 dark:border-white/10 hover:border-indigo-400 bg-white/40 dark:bg-white/5"
                }`}
              >
                <input
                  type="file"
                  ref={fileRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) setCvFile(e.target.files[0]);
                  }}
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-white/5 mx-auto flex items-center justify-center text-indigo-500 mb-3">
                  {cvFile ? <FileCheck className="w-6 h-6 text-emerald-500" /> : <UploadCloud className="w-6 h-6" />}
                </div>
                {cvFile ? (
                  <div>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5 mb-0.5">
                      <Check className="w-3.5 h-3.5" /> {cvFile.name}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      ({(cvFile.size / 1024).toFixed(1)} KB) — {isRtl ? "اضغط للتغيير" : "Click to replace"}
                    </span>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 mb-1">
                      {isRtl ? "اسحب وأفلت سيرتك الذاتية هنا أو اضغط للاختيار" : "Drop your resume here or click to browse"}
                    </p>
                    <p className="text-[11px] text-slate-400">PDF, DOCX, TXT (Max 10MB)</p>
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 flex justify-end">
              <button
                disabled={mode === "cv" && !cvFile}
                onClick={() => setStep(2)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs text-white transition-all shadow-lg ${
                  mode === "cv" && !cvFile
                    ? "bg-slate-300 dark:bg-zinc-800 cursor-not-allowed text-slate-500"
                    : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/25 active:scale-95"
                }`}
              >
                <span>{isRtl ? "المتابعة لإعداد الدور" : "Continue to Role Setup"}</span>
                <ArrowRight className="w-4 h-4 rtl:flip" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Job Role & Domain ── */}
        {step === 2 && (
          <div className="space-y-6 animate-fade-up max-w-2xl mx-auto">
            
            {/* Role Header */}
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                {isRtl ? "حدد المسمى الوظيفي المستهدف" : "Target Engineering Role"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {isRtl ? "يتم تخصيص محاور المقابلة ومعايير التقييم والأسئلة التقنية بناءً على هذا التخصص." : "Assessment criteria, technical depth, and questions are tailored to this role."}
              </p>
            </div>

            {/* Popular Chips */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2">
                {isRtl ? "أدوار سريعة وشائعة" : "Popular Roles"}
              </label>
              <div className="flex flex-wrap gap-2">
                {POPULAR_CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => { setUseCustomJob(false); setJobTitle(chip); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      !useCustomJob && jobTitle === chip
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:border-indigo-400"
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Role Dropdown / Custom Input */}
            <div className="glass-panel p-5 rounded-2xl space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-2">
                  {isRtl ? "اختر من القائمة الكاملة" : "Select from Full Catalog"}
                </label>
                <select
                  value={useCustomJob ? "__custom__" : jobTitle}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setUseCustomJob(true);
                    } else {
                      setUseCustomJob(false);
                      setJobTitle(e.target.value);
                    }
                  }}
                  className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {JOB_ROLES.map(g => (
                    <optgroup key={g.group} label={g.group} className="text-slate-800 dark:text-zinc-200 font-semibold">
                      {g.roles.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </optgroup>
                  ))}
                  <option value="__custom__" className="text-indigo-600 font-bold">
                    {isRtl ? "مسمى وظيفي مخصص..." : "Enter Custom Role..."}
                  </option>
                </select>
              </div>

              {useCustomJob && (
                <div className="animate-fade-up">
                  <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1.5">
                    {isRtl ? "اكتب المسمى الوظيفي المخصص" : "Type Your Custom Role"}
                  </label>
                  <input
                    type="text"
                    value={customJob}
                    onChange={(e) => setCustomJob(e.target.value)}
                    placeholder="e.g. Lead Platform Engineer, LLM Fine-Tuning Specialist"
                    className="w-full bg-white dark:bg-zinc-900 border border-indigo-300 dark:border-indigo-600/50 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Focus Type */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2">
                {isRtl ? "مجال التركيز الرئيسي" : "Assessment Focus Type"}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: "technical", labelEn: "Technical Depth", labelAr: "عمق تقني ومعماري" },
                  { id: "hr", labelEn: "Behavioral & HR", labelAr: "سلوكي وقيادي" },
                  { id: "mixed", labelEn: "Comprehensive", labelAr: "شامل ومتنوع" },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => setFocus(item.id)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all border text-center ${
                      focus === item.id
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-300 hover:border-indigo-400"
                    }`}
                  >
                    {isRtl ? item.labelAr : item.labelEn}
                  </button>
                ))}
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="pt-4 flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
              >
                <ArrowLeft className="w-4 h-4 rtl:flip" />
                <span>{isRtl ? "السابق" : "Back"}</span>
              </button>

              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 active:scale-95 transition-all"
              >
                <span>{isRtl ? "المتابعة لضبط المحاور والصوت" : "Configure Persona & Voice"}</span>
                <ArrowRight className="w-4 h-4 rtl:flip" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Persona, Voice & Limits ── */}
        {step === 3 && (
          <div className="space-y-6 animate-fade-up max-w-2xl mx-auto">
            
            {/* Header */}
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                {isRtl ? "شخصية المحاور والصوت ومدة الجلسة" : "Interviewer Calibration & Duration"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {isRtl ? "اضبط اللهجة المفضلة وطبيعة أسلوب المحاور والحد الأقصى للأسئلة." : "Select your voice dialect, interviewer style, and session length."}
              </p>
            </div>

            {/* Voice & Dialect with Audio Preview */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2.5">
                {isRtl ? "اللهجة والصوت" : "Interviewer Voice & Dialect"}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {VOICES.map(v => (
                  <div
                    key={v.code}
                    onClick={() => setVoiceLang(v.code)}
                    className={`glass-card p-4 rounded-xl cursor-pointer relative transition-all border ${
                      voiceLang === v.code
                        ? "ring-2 ring-indigo-500 border-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/25"
                        : "border-slate-200 dark:border-white/10 hover:border-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                        {isRtl ? v.badgeAr : v.badge}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTestVoice(v.code);
                        }}
                        className={`p-1.5 rounded-lg text-xs transition-colors ${
                          playingVoice === v.code
                            ? "bg-amber-500 text-white animate-pulse"
                            : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-zinc-300 hover:bg-indigo-500 hover:text-white"
                        }`}
                        title={isRtl ? "تجربة الصوت" : "Preview Audio"}
                      >
                        {playingVoice === v.code ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                      </button>
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-0.5">
                      {isRtl ? v.labelAr : v.label}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                      {v.voiceName}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Persona Selection */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2.5">
                {isRtl ? "شخصية وأسلوب المحاور" : "Interviewer Persona"}
              </label>
              <div className="space-y-2.5">
                {PERSONAS.map(p => (
                  <div
                    key={p.value}
                    onClick={() => setPersona(p.value)}
                    className={`glass-card p-4 rounded-xl cursor-pointer flex items-center gap-3.5 transition-all border ${
                      persona === p.value
                        ? "ring-2 ring-indigo-500 border-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/25"
                        : "border-slate-200 dark:border-white/10 hover:border-slate-300"
                    }`}
                  >
                    {p.iconType === "balanced" && (
                      <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <Sliders className="w-4 h-4" />
                      </div>
                    )}
                    {p.iconType === "strict" && (
                      <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                    )}
                    {p.iconType === "supportive" && (
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white mb-0.5">
                        {isRtl ? p.labelAr : p.labelEn}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {isRtl ? p.descAr : p.descEn}
                      </div>
                    </div>
                    {persona === p.value && (
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] shrink-0">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Session Scope: Question Count / Duration */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-200 dark:border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                  {isRtl ? "عدد الأسئلة التقنية" : "Number of Technical Questions"}
                </label>
                <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-indigo-600 text-white font-mono">
                  {limitValue} {isRtl ? "أسئلة" : "questions"}
                </span>
              </div>
              <input
                type="range"
                min={3}
                max={10}
                step={1}
                value={limitValue}
                onChange={(e) => setLimitValue(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>3 (Quick Screen)</span>
                <span>5 (Standard)</span>
                <span>10 (Exhaustive)</span>
              </div>
            </div>

            {/* Ready Confirmation & Launch Button */}
            <div className="pt-4 flex items-center justify-between">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
              >
                <ArrowLeft className="w-4 h-4 rtl:flip" />
                <span>{isRtl ? "السابق" : "Back"}</span>
              </button>

              <button
                onClick={startSession}
                className="flex items-center gap-2.5 px-8 py-3.5 rounded-xl font-black text-xs bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:opacity-95 text-white shadow-xl shadow-indigo-600/30 active:scale-95 transition-all"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>{isRtl ? "بدء المقابلة الآن" : "Launch Interview Now"}</span>
              </button>
            </div>

          </div>
        )}

      </main>

      {/* Subtle Footer */}
      <footer className="text-center py-6 text-[11px] text-slate-400 dark:text-zinc-600 border-t border-slate-200/50 dark:border-white/5 relative z-10">
        AutoHire · Technical Interview Assessment Platform
      </footer>
    </div>
  );
}
