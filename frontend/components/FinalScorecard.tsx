"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Radar, RadarChart, PolarAngleAxis, PolarGrid, ResponsiveContainer, Tooltip } from "recharts";
import {
  Award, Share2, ShieldCheck, ShieldAlert, FileDown, CheckCircle2,
  BookOpen, Home, Copy, Check, ExternalLink, Sparkles, AlertTriangle,
  TrendingUp, Compass, ArrowRight, RotateCcw
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";

interface FinalScorecardProps {
  payload: any;
  jobTitle: string;
}

export default function FinalScorecard({ payload, jobTitle }: FinalScorecardProps) {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const { theme } = useTheme();
  const isRtl = locale === "ar";
  
  const [copied, setCopied] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(true);

  React.useEffect(() => {
    if (payload && !payload.error) {
      const timer = setTimeout(() => setIsAnalyzing(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [payload]);

  const isDark = theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (!payload || payload.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#09090b] text-slate-800 dark:text-zinc-200 p-6" dir={isRtl ? "rtl" : "ltr"}>
        <div className="max-w-md w-full text-center p-8 glass-panel border border-red-200 dark:border-red-900/40 rounded-2xl shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-4 border border-red-500/20">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t("eval_failed")}</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mb-6">{payload?.error || "Unable to generate scorecard"}</p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
          >
            {isRtl ? "العودة للرئيسية" : "Return to Home"}
          </button>
        </div>
      </div>
    );
  }

  const radarData = [
    { subject: isRtl ? "العمق التقني" : "Technical Depth", score: payload.technical_depth ?? 70 },
    { subject: isRtl ? "معمارية النظم" : "Architecture", score: payload.architecture ?? payload.code_quality ?? 75 },
    { subject: isRtl ? "حل المشكلات" : "Problem Solving", score: payload.problem_solving ?? 65 },
    { subject: isRtl ? "التواصل والشرح" : "Communication", score: payload.communication ?? 85 },
    { subject: isRtl ? "نزاهة التقييم" : "Integrity", score: payload.integrity ?? 100 },
  ];

  const overallScore = Math.round(radarData.reduce((a, c) => a + c.score, 0) / radarData.length);

  const getRecStyles = (rec: string) => {
    const l = rec?.toLowerCase() || "";
    if (l.includes("strong")) {
      return {
        badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        ring: "text-emerald-500",
        label: isRtl ? "توصية قوية بالتعيين (Strong Hire)" : "Strong Hire Recommended",
        gradient: "from-emerald-500/20 to-teal-500/5",
      };
    }
    if (l.includes("no hire")) {
      return {
        badge: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
        ring: "text-rose-500",
        label: isRtl ? "غير مرشح حالياً (No Hire)" : "No Hire Decision",
        gradient: "from-rose-500/20 to-amber-500/5",
      };
    }
    return {
      badge: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
      ring: "text-indigo-500",
      label: isRtl ? "مؤهل للتعيين (Hire)" : "Hire Recommendation",
      gradient: "from-indigo-500/20 to-violet-500/5",
    };
  };

  const recStyle = getRecStyles(payload.final_recommendation);

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLinkedIn = () => {
    const text = `I just completed my technical interview for ${jobTitle} on AutoHire, scoring ${overallScore}/100!\n\n#Engineering #TechnicalInterview #AutoHire`;
    window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`, "_blank");
  };

  if (isAnalyzing) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-slate-50 dark:bg-[#09090b] text-slate-800 dark:text-zinc-200 p-6 relative overflow-hidden" dir={isRtl ? "rtl" : "ltr"}>
        <div className="ambient-glow w-80 h-80 bg-indigo-500/20" />
        <div className="w-16 h-16 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-indigo-600 animate-spin mb-6 relative z-10" />
        <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight mb-2 relative z-10">
          {isRtl ? "جاري إعداد تقرير التقييم الفني..." : "Preparing Assessment Report..."}
        </h2>
        <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400 animate-pulse relative z-10">
          {isRtl ? "حساب معايير الأداء والتقييم الفني" : "Evaluating performance and technical criteria"}
        </p>
      </div>
    );
  }

  // Circular gauge calculations
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (overallScore / 100) * circumference;

  return (
    <>
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 font-[family-name:var(--font-inter)] p-4 sm:p-8 md:p-10 relative overflow-hidden print:hidden" dir={isRtl ? "rtl" : "ltr"}>
        
        {/* Background Ambient Glows */}
        <div className="ambient-glow w-[500px] h-[500px] bg-indigo-500/10 dark:bg-indigo-600/15 top-[-50px] right-[-50px]" />
        <div className="ambient-glow w-[600px] h-[600px] bg-violet-500/10 dark:bg-violet-600/10 bottom-[-100px] left-[-100px]" />

        <div className="max-w-6xl mx-auto relative z-10">

          {/* ── Top Header Bar ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-200 dark:border-white/10">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/25">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {t("final_scorecard")}
                  </h1>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    <ShieldCheck className="w-3 h-3" />
                    {isRtl ? "تم التحقق من النزاهة" : "Proctored & Verified"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium mt-0.5">
                  {jobTitle} · {new Date().toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { year: "numeric", month: "short", day: "numeric" })}
                </p>
              </div>
            </div>

            {/* Top Actions */}
            <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap justify-end">
              <button
                onClick={() => router.push("/")}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isRtl ? "مقابلة جديدة" : "New Interview"}</span>
              </button>

              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                title="Copy shareable link"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? (isRtl ? "تم النسخ!" : "Copied!") : (isRtl ? "نسخ الرابط" : "Copy Link")}</span>
              </button>

              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-zinc-200 hover:border-indigo-400 transition-all shadow-sm"
              >
                <FileDown className="w-3.5 h-3.5 text-indigo-500" />
                <span>{t("pdf_report")}</span>
              </button>

              <button
                onClick={handleLinkedIn}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#0a66c2] hover:bg-[#004182] text-white transition-all shadow-md shadow-blue-500/20"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{t("brag_linkedin")}</span>
              </button>
            </div>
          </div>

          {/* ── Main Scorecard Content Grid ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pb-16">

            {/* ── Left Sticky Column: Verdict & Metrics ── */}
            <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-6">
              
              {/* Executive Verdict Card */}
              <div className={`p-6 rounded-2xl glass-panel border bg-gradient-to-br ${recStyle.gradient} relative overflow-hidden shadow-xl`}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    {isRtl ? "قرار التقييم النهائي" : "Executive Decision"}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-black border ${recStyle.badge}`}>
                    {payload.final_recommendation || "Hire"}
                  </span>
                </div>

                <div className="text-base font-black text-slate-900 dark:text-white mb-6 leading-snug">
                  {recStyle.label}
                </div>

                {/* Circular Score Gauge */}
                <div className="flex items-center justify-center my-2">
                  <div className="relative w-36 h-36 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                      {/* Background circle */}
                      <circle
                        cx="60"
                        cy="60"
                        r={radius}
                        className="stroke-slate-200 dark:stroke-zinc-800"
                        strokeWidth="10"
                        fill="transparent"
                      />
                      {/* Animated score circle */}
                      <circle
                        cx="60"
                        cy="60"
                        r={radius}
                        className="stroke-indigo-600 dark:stroke-indigo-500 transition-all duration-1000 ease-out"
                        strokeWidth="10"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        fill="transparent"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center text-center">
                      <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                        {overallScore}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        / 100
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-center mt-4 text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
                  {isRtl ? "معدل الكفاءة المجمّع عبر كافة الأبعاد الهندسية" : "Aggregated competency index across all core dimensions"}
                </div>
              </div>

              {/* Radar Chart Card */}
              <div className="glass-panel p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                    {isRtl ? "مخطط الكفاءات الراداري" : "Competency Radar"}
                  </h3>
                  <span className="text-[10px] font-mono text-indigo-500">Live 5-Axis</span>
                </div>
                <div className="h-[250px] w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="60%" data={radarData}>
                      <PolarGrid stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"} />
                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{ fill: isDark ? "#a1a1aa" : "#475569", fontSize: 10, fontWeight: 700 }}
                      />
                      <Radar
                        name="Score"
                        dataKey="score"
                        stroke="#6366f1"
                        fill="#6366f1"
                        strokeWidth={2.5}
                        fillOpacity={0.35}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Dimension Score Progress Bars */}
              <div className="glass-panel p-5 rounded-2xl border border-slate-200 dark:border-white/10 space-y-3.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-2">
                  {isRtl ? "تفصيل المهارات الهندسية" : "Dimension Breakdown"}
                </h3>
                {radarData.map((d, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      <span>{d.subject}</span>
                      <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{d.score}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-700"
                        style={{ width: `${d.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

            </div>

            {/* ── Right Column: Analytical Deep-Dive ── */}
            <div className="lg:col-span-8 space-y-6">

              {/* Key Strengths */}
              <div className="glass-panel p-6 rounded-2xl border border-emerald-500/20 bg-emerald-50/10 dark:bg-emerald-950/10 shadow-sm">
                <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-emerald-500/20">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {isRtl ? "نقاط القوة البارزة" : "Key Engineering Strengths"}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {isRtl ? "الجوانب التي أظهر فيها المرشح عمقاً هندسياً عالياً" : "Demonstrated technical depth and solid reasoning"}
                    </p>
                  </div>
                </div>

                <ul className="space-y-3">
                  {payload.key_strengths?.map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-3 text-xs leading-relaxed text-slate-800 dark:text-zinc-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="font-medium">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Areas for Improvement */}
              <div className="glass-panel p-6 rounded-2xl border border-amber-500/20 bg-amber-50/10 dark:bg-amber-950/10 shadow-sm">
                <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-amber-500/20">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <Compass className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {isRtl ? "فرص التحسين والتطوير" : "Targeted Growth Areas"}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {isRtl ? "المفاهيم التي يُنصح بالتعمق فيها للوصول لمستوى أعلى" : "Concepts to deepen for senior-level engineering mastery"}
                    </p>
                  </div>
                </div>

                <ul className="space-y-3">
                  {payload.key_weaknesses?.map((w: string, i: number) => (
                    <li key={i} className="flex items-start gap-3 text-xs leading-relaxed text-slate-800 dark:text-zinc-200">
                      <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        •
                      </span>
                      <span className="font-medium">{w}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Red Flags if any */}
              {payload.red_flags?.length > 0 && (
                <div className="glass-panel p-6 rounded-2xl border border-rose-500/30 bg-rose-50/20 dark:bg-rose-950/20 shadow-sm">
                  <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-rose-500/20">
                    <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-rose-700 dark:text-rose-300">
                        {isRtl ? "ملاحظات حرجة (Red Flags)" : "Critical Engineering Gaps"}
                      </h3>
                      <p className="text-[11px] text-rose-500 dark:text-rose-400">
                        {isRtl ? "أخطاء معمارية أو تباينات تتطلب الانتباه الفوري" : "Architectural discrepancies or critical oversights recorded"}
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-3">
                    {payload.red_flags.map((rf: string, i: number) => (
                      <li key={i} className="flex items-start gap-3 text-xs leading-relaxed text-rose-800 dark:text-rose-200">
                        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <span className="font-medium">{rf}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Curated Learning Resources */}
              {payload.recommended_resources?.length > 0 && (
                <div className="glass-panel p-6 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
                  <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-200 dark:border-white/10">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {isRtl ? "مصادر تعليمية مخصصة لتطوير مهاراتك" : "Targeted Learning Roadmap"}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {isRtl ? "روابط مختارة بعناية لمعالجة الثغرات التقنية المرصودة في المقابلة" : "Curated architectural deep-dives mapped directly to your answers"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {payload.recommended_resources.map((res: any, idx: number) => (
                      <a
                        key={idx}
                        href={res.url || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="glass-card p-4 rounded-xl block border border-slate-200 dark:border-white/10 hover:border-indigo-400 group"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100 group-hover:text-indigo-500 transition-colors line-clamp-1">
                            {res.title}
                          </h4>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 shrink-0" />
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed line-clamp-2">
                          {res.reason}
                        </p>
                      </a>
                    ))}
                  </div>
                </div>
              )}

            </div>

          </div>

        </div>
      </div>

      {/* ── PRINT-OPTIMIZED EXECUTIVE VIEW ── */}
      <div className="hidden print:block bg-white text-black p-8 max-w-[210mm] mx-auto text-xs leading-relaxed font-sans" dir="ltr">
        <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">Technical Assessment Scorecard</h1>
            <h2 className="text-sm font-bold text-slate-600">{jobTitle}</h2>
          </div>
          <div className="text-right text-[10px] text-slate-500 font-mono">
            <p>AutoHire Technical Assessment Report</p>
            <p>Date: {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6 p-4 bg-slate-50 border border-slate-200 rounded">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Overall Competency Score</span>
            <span className="text-4xl font-black text-black">{overallScore} / 100</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Recommendation</span>
            <span className="text-2xl font-black text-black uppercase">{payload.final_recommendation}</span>
          </div>
        </div>

        <h3 className="text-xs font-bold uppercase tracking-wider mb-2 border-b pb-1">Competency Breakdown</h3>
        <table className="w-full mb-6 border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-300">
              <th className="py-1.5 font-bold text-slate-600">Dimension</th>
              <th className="py-1.5 font-bold text-slate-600 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {radarData.map((d, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-1.5 font-medium">{d.subject}</td>
                <td className="py-1.5 font-black text-right">{d.score}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="space-y-4">
          <div>
            <h4 className="font-bold text-emerald-800 border-b border-emerald-200 pb-1 mb-2">Key Strengths</h4>
            <ul className="list-disc pl-5 space-y-1 text-slate-800">
              {payload.key_strengths?.map((s: string, i: number) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-amber-800 border-b border-amber-200 pb-1 mb-2">Areas for Improvement</h4>
            <ul className="list-disc pl-5 space-y-1 text-slate-800">
              {payload.key_weaknesses?.map((w: string, i: number) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
