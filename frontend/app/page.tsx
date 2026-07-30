"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase, FileText, UploadCloud, Globe, Moon, Sun,
  ArrowRight, ArrowLeft, ChevronDown, Monitor
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";

const JOB_ROLES = [
  { group: "AI & Machine Learning", roles: ["Senior AI Engineer", "Junior AI Engineer", "Data Scientist", "MLOps Engineer", "Computer Vision Engineer", "NLP Engineer"] },
  { group: "Software Engineering", roles: ["Senior Backend Engineer", "Senior Frontend Engineer", "Full Stack Engineer", "Staff Software Engineer", "Cloud Architect", "DevOps Engineer", "Cybersecurity Analyst"] },
  { group: "Data & Analytics", roles: ["Data Engineer", "Analytics Engineer", "Business Intelligence Analyst"] },
];

const PERSONAS = [
  { value: "balanced", label: "Balanced", desc: "Standard professional interview style" },
  { value: "strict", label: "Strict", desc: "High-pressure, FAANG-style assessment" },
  { value: "supportive", label: "Supportive", desc: "Guiding, mentorship-oriented approach" },
];

const FOCUS_TYPES = [
  { value: "technical", label: "Technical" },
  { value: "hr", label: "Behavioral / HR" },
  { value: "mixed", label: "Mixed" },
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
  const [voiceLang, setVoiceLang] = useState<"en" | "ar" | "ar-eg">("en");
  const [limitMode, setLimitMode] = useState<"questions" | "time">("questions");
  const [limitValue, setLimitValue] = useState(5);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [isBooting, setIsBooting] = useState(false);
  const [bootLog, setBootLog] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const isRtl = locale === "ar";
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const addLog = (msg: string) => setBootLog(p => [...p, msg]);

  const startSession = async () => {
    setIsBooting(true);
    setBootLog([]);
    let wakeUpTimer: NodeJS.Timeout | undefined;
    try {
      addLog("Initializing assessment protocol...");
      const effectiveJob = useCustomJob && customJob.trim() ? customJob.trim() : jobTitle;

      await new Promise(r => setTimeout(r, 400));
      addLog("Fetching interview context from web...");

      let res: Response;
      
      wakeUpTimer = setTimeout(() => {
        addLog(locale === "ar" 
          ? "جاري إيقاظ خوادم الذكاء الاصطناعي (قد يستغرق 50 ثانية بسبب الخطة المجانية)..." 
          : "Waking up AI servers (may take ~50s due to free tier)...");
      }, 4000);

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
        res = await fetch(`${API_URL}/api/start-session-cv`, { method: "POST", body: fd });
      } else {
        res = await fetch(`${API_URL}/api/start-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

      const data = await res.json();
      clearTimeout(wakeUpTimer);
      if (!data.session_id) throw new Error("No session ID received");

      addLog("Calibrating AI interviewer...");
      await new Promise(r => setTimeout(r, 300));
      addLog("Preparing voice streams...");
      await new Promise(r => setTimeout(r, 200));
      addLog("Session ready — entering interview room...");
      await new Promise(r => setTimeout(r, 300));

      router.push(`/interview/${data.session_id}`);
    } catch (e: any) {
      clearTimeout(wakeUpTimer);
      addLog(`Error: ${e.message || "Connection failed. Please retry."}`);
      setTimeout(() => setIsBooting(false), 3000);
    }
  };

  const toggleTheme = () => {
    if (theme === "dark") setTheme("light");
    else if (theme === "light") setTheme("system");
    else setTheme("dark");
  };

  // Boot screen
  if (isBooting) {
    return (
      <div className="min-h-screen bg-white dark:bg-stone-950 flex items-end p-12 font-[family-name:var(--font-jetbrains-mono)]" dir="ltr">
        <div className="max-w-lg">
          {bootLog.map((log, i) => (
            <div key={i} className="text-slate-500 dark:text-stone-400 text-sm mb-3 animate-fade-up" style={{ animationDelay: `${i * 0.08}s` }}>
              <span className="text-slate-900 dark:text-stone-200 font-bold me-2">›</span>{log}
            </div>
          ))}
          <div className="w-2.5 h-5 bg-slate-900 dark:bg-stone-200 animate-pulse mt-4" />
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-stone-950 text-slate-900 dark:text-stone-100 font-[family-name:var(--font-inter)]`} dir={isRtl ? "rtl" : "ltr"}>

      {/* Top bar */}
      <div className="border-b border-slate-200 dark:border-stone-800/60 bg-white/80 dark:bg-stone-950/80 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-slate-900 dark:bg-stone-100" />
          <span className="text-sm font-bold text-slate-900 dark:text-stone-100">AutoHire</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleLanguage} className="text-xs font-bold px-3 py-1.5 rounded border border-slate-200 dark:border-stone-800 text-slate-500 dark:text-stone-400 hover:bg-slate-100 dark:hover:bg-stone-800 transition-colors flex items-center gap-1.5">
            <Globe className="w-3 h-3" />
            {locale === "en" ? "عربي" : "English"}
          </button>
          <button onClick={toggleTheme} className="w-7 h-7 rounded border border-slate-200 dark:border-stone-800 text-slate-500 dark:text-stone-400 hover:bg-slate-100 dark:hover:bg-stone-800 flex items-center justify-center transition-colors">
            {theme === "dark" ? <Moon className="w-3.5 h-3.5" /> : theme === "light" ? <Sun className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-10">
          {[1, 2, 3].map(s => (
            <React.Fragment key={s}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                s < step ? "bg-slate-900 dark:bg-stone-200 text-white dark:text-stone-900"
                : s === step ? "bg-slate-900 dark:bg-stone-200 text-white dark:text-stone-900 ring-4 ring-slate-900/10 dark:ring-stone-200/10"
                : "bg-slate-100 dark:bg-stone-800 text-slate-400 dark:text-stone-600"
              }`}>{s}</div>
              {s < 3 && <div className={`flex-1 h-px transition-colors ${s < step ? "bg-slate-900 dark:bg-stone-200" : "bg-slate-200 dark:bg-stone-800"}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* ── STEP 1: Mode ── */}
        {step === 1 && (
          <div className="animate-fade-up">
            <h1 className="text-2xl font-black text-slate-900 dark:text-stone-50 mb-2">
              {locale === "ar" ? "اختر نوع التقييم" : "Select Assessment Mode"}
            </h1>
            <p className="text-sm text-slate-500 dark:text-stone-400 mb-8">
              {locale === "ar" ? "اختر طريقة إجراء المقابلة" : "Choose how the interview will be conducted"}
            </p>

            <div className="space-y-3">
              {[
                { key: "standard" as const, icon: Briefcase, title: locale === "ar" ? "تقييم معياري" : "Standard Assessment", desc: locale === "ar" ? "أسئلة تقنية مستندة إلى الإنترنت في الوقت الفعلي" : "Real-time web-sourced technical questions for your role" },
                { key: "cv" as const, icon: FileText, title: locale === "ar" ? "تقييم مخصص للسيرة الذاتية" : "CV-Tailored Assessment", desc: locale === "ar" ? "أسئلة مولدة من سيرتك الذاتية المرفوعة" : "Questions generated dynamically from your uploaded resume" },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => { setMode(opt.key); setStep(2); }}
                  className={`w-full text-start p-5 rounded-xl border-2 transition-all flex items-start gap-4 group ${
                    mode === opt.key
                      ? "border-slate-900 dark:border-stone-200 bg-slate-50 dark:bg-stone-900/50"
                      : "border-slate-200 dark:border-stone-800 bg-white dark:bg-stone-900/20 hover:border-slate-400 dark:hover:border-stone-600"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${mode === opt.key ? "bg-slate-900 dark:bg-stone-200 text-white dark:text-stone-900" : "bg-slate-100 dark:bg-stone-800 text-slate-500 dark:text-stone-400"}`}>
                    <opt.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 dark:text-stone-100 mb-1">{opt.title}</div>
                    <div className="text-sm text-slate-500 dark:text-stone-400 leading-relaxed">{opt.desc}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 dark:text-stone-600 mt-1 group-hover:text-slate-500 dark:group-hover:text-stone-400 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 2: Configure ── */}
        {step === 2 && (
          <div className="animate-fade-up space-y-7">
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-stone-50 mb-1">
                {locale === "ar" ? "إعداد الجلسة" : "Configure Session"}
              </h1>
              <p className="text-sm text-slate-500 dark:text-stone-400">
                {locale === "ar" ? "خصص تجربة المقابلة" : "Customize your interview experience"}
              </p>
            </div>

            {/* Job Role */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-stone-500 mb-3">
                {locale === "ar" ? "المسمى الوظيفي" : "Job Role"}
              </label>
              <div className="relative">
                <select
                  value={useCustomJob ? "__custom__" : jobTitle}
                  onChange={e => {
                    if (e.target.value === "__custom__") { setUseCustomJob(true); }
                    else { setUseCustomJob(false); setJobTitle(e.target.value); }
                  }}
                  className="w-full bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 rounded-lg px-4 py-3 text-sm font-semibold text-slate-900 dark:text-stone-100 focus:outline-none focus:border-slate-500 dark:focus:border-stone-500 appearance-none cursor-pointer pr-10"
                >
                  {JOB_ROLES.map(g => (
                    <optgroup key={g.group} label={g.group}>
                      {g.roles.map(r => <option key={r} value={r}>{r}</option>)}
                    </optgroup>
                  ))}
                  <option value="__custom__">— Custom role...</option>
                </select>
                <ChevronDown className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
              {useCustomJob && (
                <input
                  autoFocus
                  value={customJob}
                  onChange={e => setCustomJob(e.target.value)}
                  placeholder="e.g. Quantum Computing Researcher"
                  className="mt-2 w-full bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 rounded-lg px-4 py-3 text-sm font-semibold text-slate-900 dark:text-stone-100 focus:outline-none focus:border-slate-500 placeholder:text-slate-400 placeholder:font-normal"
                />
              )}
            </div>

            {/* Focus + Persona */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-stone-500 mb-3">
                  {locale === "ar" ? "نوع المقابلة" : "Interview Focus"}
                </label>
                <div className="space-y-2">
                  {FOCUS_TYPES.map(f => (
                    <button
                      key={f.value}
                      onClick={() => setFocus(f.value)}
                      className={`w-full text-start px-4 py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                        focus === f.value
                          ? "border-slate-900 dark:border-stone-300 bg-slate-900 dark:bg-stone-200 text-white dark:text-stone-900"
                          : "border-slate-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-slate-600 dark:text-stone-400 hover:border-slate-400 dark:hover:border-stone-600"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-stone-500 mb-3">
                  {locale === "ar" ? "شخصية المحاور" : "Interviewer Persona"}
                </label>
                <div className="space-y-2">
                  {PERSONAS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setPersona(p.value)}
                      className={`w-full text-start px-4 py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                        persona === p.value
                          ? "border-slate-900 dark:border-stone-300 bg-slate-900 dark:bg-stone-200 text-white dark:text-stone-900"
                          : "border-slate-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-slate-600 dark:text-stone-400 hover:border-slate-400 dark:hover:border-stone-600"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Voice Language */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-stone-500 mb-3">
                {locale === "ar" ? "لغة المقابلة" : "Interview Language"}
              </label>
              <div className="flex gap-2">
                {(["en", "ar", "ar-eg"] as const).map(lang => (
                  <button
                    key={lang}
                    onClick={() => setVoiceLang(lang)}
                    className={`flex-1 py-3 rounded-lg border text-xs sm:text-sm font-bold transition-all ${
                      voiceLang === lang
                        ? "border-slate-900 dark:border-stone-300 bg-slate-900 dark:bg-stone-200 text-white dark:text-stone-900"
                        : "border-slate-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-slate-600 dark:text-stone-400 hover:border-slate-400 dark:hover:border-stone-600"
                    }`}
                  >
                    {lang === "en" ? "English" : lang === "ar" ? "عربي فصحى" : "عربي مصري"}
                  </button>
                ))}
              </div>
            </div>

            {/* Session limit */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-stone-500 mb-3">
                {locale === "ar" ? "مدة الجلسة" : "Session Limit"}
              </label>
              <div className="flex gap-3 mb-4">
                {(["questions", "time"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => { setLimitMode(m); setLimitValue(m === "time" ? 10 : 5); }}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                      limitMode === m
                        ? "border-slate-900 dark:border-stone-300 bg-slate-900 dark:bg-stone-200 text-white dark:text-stone-900"
                        : "border-slate-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-slate-600 dark:text-stone-400"
                    }`}
                  >
                    {m === "questions" ? (locale === "ar" ? "أسئلة" : "Questions") : (locale === "ar" ? "وقت" : "Time")}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={limitMode === "time" ? 5 : 3}
                  max={limitMode === "time" ? 60 : 20}
                  step={limitMode === "time" ? 5 : 1}
                  value={limitValue}
                  onChange={e => setLimitValue(Number(e.target.value))}
                  className="flex-1 accent-slate-900 dark:accent-stone-200 h-1.5"
                />
                <div className="text-sm font-black text-slate-900 dark:text-stone-100 min-w-[80px] text-end">
                  {limitValue} {limitMode === "time" ? (locale === "ar" ? "دقيقة" : "min") : (locale === "ar" ? "سؤال" : "Q")}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Launch ── */}
        {step === 3 && (
          <div className="animate-fade-up">
            <h1 className="text-2xl font-black text-slate-900 dark:text-stone-50 mb-2">
              {locale === "ar" ? "ابدأ الجلسة" : "Launch Session"}
            </h1>
            <p className="text-sm text-slate-500 dark:text-stone-400 mb-8">
              {locale === "ar" ? "راجع الإعدادات وابدأ" : "Review settings and start the interview"}
            </p>

            {/* Summary card */}
            <div className="bg-white dark:bg-stone-900/50 border border-slate-200 dark:border-stone-800 rounded-xl p-5 mb-6 space-y-3">
              {[
                { label: locale === "ar" ? "الدور" : "Role", value: useCustomJob ? customJob : jobTitle },
                { label: locale === "ar" ? "النوع" : "Focus", value: focus },
                { label: locale === "ar" ? "الشخصية" : "Persona", value: persona },
                { label: locale === "ar" ? "اللغة" : "Language", value: voiceLang === "en" ? "English" : voiceLang === "ar" ? "عربي فصحى" : "عربي مصري" },
                { label: locale === "ar" ? "الحد" : "Limit", value: `${limitValue} ${limitMode === "time" ? "min" : "questions"}` },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-stone-500 font-medium">{item.label}</span>
                  <span className="font-bold text-slate-900 dark:text-stone-100">{item.value}</span>
                </div>
              ))}
            </div>

            {mode === "cv" && (
              <div className="mb-6">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-stone-500 mb-3">
                  {locale === "ar" ? "رفع السيرة الذاتية" : "Upload CV"}
                </label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-stone-700 rounded-xl p-8 text-center cursor-pointer hover:border-slate-500 dark:hover:border-stone-500 transition-colors"
                >
                  <UploadCloud className="w-8 h-8 text-slate-300 dark:text-stone-600 mx-auto mb-3" />
                  <div className="text-sm font-semibold text-slate-700 dark:text-stone-300">
                    {cvFile ? cvFile.name : (locale === "ar" ? "انقر لرفع ملف PDF أو DOCX" : "Click to upload PDF or DOCX")}
                  </div>
                  <input ref={fileRef} type="file" accept=".pdf,.docx" className="hidden" onChange={e => setCvFile(e.target.files?.[0] || null)} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-10 pt-6 border-t border-slate-200 dark:border-stone-800/50">
          <button
            onClick={() => setStep(p => Math.max(1, p - 1))}
            className={`flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-stone-400 hover:text-slate-900 dark:hover:text-stone-100 transition-colors ${step === 1 ? "invisible" : ""}`}
          >
            <ArrowLeft className="w-4 h-4" />
            {locale === "ar" ? "رجوع" : "Back"}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(p => p + 1)}
              className="flex items-center gap-2 bg-slate-900 dark:bg-stone-200 hover:bg-slate-800 dark:hover:bg-stone-100 text-white dark:text-stone-900 px-6 py-2.5 rounded-lg text-sm font-bold transition-colors"
            >
              {locale === "ar" ? "التالي" : "Continue"}
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={startSession}
              disabled={mode === "cv" && !cvFile}
              className="flex items-center gap-2 bg-slate-900 dark:bg-stone-200 hover:bg-slate-800 dark:hover:bg-stone-100 text-white dark:text-stone-900 px-8 py-2.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {locale === "ar" ? "بدء المقابلة" : "Start Interview"}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
