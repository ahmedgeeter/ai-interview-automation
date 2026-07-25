"use client";

import React from "react";
import { Radar, RadarChart, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { Award, Share2, ShieldCheck, ShieldAlert, FileDown, CheckCircle2, BookOpen, Home } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";

interface FinalScorecardProps {
  payload: any;
  jobTitle: string;
}

export default function FinalScorecard({ payload, jobTitle }: FinalScorecardProps) {
  const { locale, t } = useLanguage();
  const { theme } = useTheme();
  const isRtl = locale === "ar";
  const [isAnalyzing, setIsAnalyzing] = React.useState(true);

  React.useEffect(() => {
    if (payload && !payload.error) {
      const timer = setTimeout(() => setIsAnalyzing(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [payload]);
  
  const isDark = theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (!payload || payload.error) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-stone-950 text-slate-500 dark:text-stone-400 font-[family-name:var(--font-inter)]" dir={isRtl ? "rtl" : "ltr"}>
        <div className="text-center p-8 border border-red-200 dark:border-red-900/40 rounded-md bg-red-50 dark:bg-red-950/10 shadow-sm">
          <ShieldAlert className="w-10 h-10 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-stone-50 mb-2">{t("eval_failed")}</h2>
          <p className="text-sm text-slate-500 dark:text-stone-400">{payload?.error || "Unknown error"}</p>
        </div>
      </div>
    );
  }

  const radarData = [
    { subject: t("architecture"), score: payload.technical_depth ?? 0 },
    { subject: t("code_quality"), score: payload.code_quality ?? payload.architecture ?? 0 },
    { subject: t("problem_solving"), score: payload.problem_solving ?? 0 },
    { subject: t("communication"), score: payload.communication ?? 85 },
    { subject: t("integrity"), score: payload.integrity ?? 100 },
  ];

  const overallScore = Math.round(radarData.reduce((a, c) => a + c.score, 0) / radarData.length);

  const getRecColor = (rec: string) => {
    const l = rec?.toLowerCase() || "";
    if (l.includes("strong")) return "text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/15";
    if (l.includes("no hire")) return "text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/15";
    return "text-slate-700 dark:text-stone-300 border-slate-200 dark:border-stone-800 bg-white dark:bg-stone-900/50";
  };

  const recTranslation = () => {
    const l = payload.final_recommendation?.toLowerCase() || "";
    if (l.includes("strong")) return t("strong_hire");
    if (l.includes("no hire")) return t("no_hire");
    return t("hire");
  };

  const handleLinkedIn = () => {
    const text = `I just completed an autonomous AI engineering assessment for ${jobTitle} and scored ${overallScore}/100! 🚀\n\n#AI #TechInterview #HireMe`;
    window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`, "_blank");
  };

  if (isAnalyzing) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-slate-50 dark:bg-stone-950 text-slate-800 dark:text-stone-200 font-[family-name:var(--font-inter)]" dir={isRtl ? "rtl" : "ltr"}>
        <div className="w-16 h-16 border-4 border-slate-200 dark:border-stone-800 border-t-slate-900 dark:border-t-stone-200 rounded-full animate-spin mb-6" />
        <h2 className="text-xl font-black tracking-tight mb-2">{locale === "ar" ? "جاري تحليل الإجابات وتوليد النتيجة..." : "Synthesizing interview data..."}</h2>
        <p className="text-sm font-medium text-slate-500 dark:text-stone-500 animate-pulse">{locale === "ar" ? "يتم الآن بناء خريطة الكفاءة" : "Building competency map"}</p>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-slate-50 dark:bg-stone-950 noise-bg text-slate-800 dark:text-stone-300 font-[family-name:var(--font-inter)] p-6 md:p-10 print:hidden" dir={isRtl ? "rtl" : "ltr"}>
        
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-10 gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-slate-900 dark:bg-stone-200 flex items-center justify-center shadow-md">
                <Award className="w-6 h-6 text-white dark:text-stone-900" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-900 dark:text-stone-50 tracking-tight">{t("final_scorecard")}</h1>
                <p className="text-sm text-slate-500 dark:text-stone-400 font-medium">{jobTitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto flex-wrap justify-end">
              <button onClick={() => window.location.reload()} className="flex-1 md:flex-none justify-center bg-slate-100 dark:bg-stone-800 hover:bg-slate-200 dark:hover:bg-stone-700 text-slate-800 dark:text-stone-200 px-5 py-2.5 rounded-md text-xs font-bold flex items-center gap-2 transition-colors shadow-sm">
                <Home className="w-4 h-4" />{locale === "ar" ? "الرئيسية" : "Home"}
              </button>
              <button onClick={() => window.print()} className="flex-1 md:flex-none justify-center bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 hover:bg-slate-50 dark:hover:bg-stone-800 text-slate-700 dark:text-stone-300 px-5 py-2.5 rounded-md text-xs font-bold flex items-center gap-2 transition-colors shadow-sm">
                <FileDown className="w-4 h-4" />{t("pdf_report")}
              </button>
              <button onClick={handleLinkedIn} className="flex-1 md:flex-none justify-center bg-[#0a66c2] hover:bg-[#004182] text-white px-5 py-2.5 rounded-md text-xs font-bold flex items-center gap-2 transition-colors shadow-sm">
                <Share2 className="w-4 h-4" />{t("brag_linkedin")}
              </button>
            </div>
          </div>

          {/* Content Layout */}
          <div className="flex flex-col lg:flex-row gap-8 items-start pb-20">

            {/* Left Column (Sticky Sidebar) */}
            <div className="w-full lg:w-[35%] flex flex-col gap-6 lg:sticky lg:top-6 shrink-0">
              {/* Recommendation Box */}
              <div className={`p-8 rounded-xl border text-center shadow-sm ${getRecColor(payload.final_recommendation)}`}>
                <div className="text-xs font-bold uppercase tracking-wider opacity-70 mb-2">{t("recommendation")}</div>
                <div className="text-4xl font-black tracking-tight">{recTranslation()}</div>
              </div>
              
              {/* Overall Score Box */}
              <div className="p-8 rounded-xl border border-slate-200 dark:border-stone-800 bg-white dark:bg-stone-900/40 text-center shadow-sm">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-stone-500 mb-6">{t("overall_score")}</div>
                <div className="text-6xl font-black text-slate-900 dark:text-stone-50 leading-normal py-2">
                  {overallScore}<span className="text-2xl text-slate-400 dark:text-stone-600 font-semibold ml-1">/100</span>
                </div>
              </div>
              
              {/* Radar Chart */}
              <div className="border border-slate-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900/30 p-6 shadow-sm flex flex-col">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-stone-500 text-center mb-4">{t("live_competency")}</div>
                <div className="h-[280px] w-full relative -mt-4" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="55%" data={radarData}>
                      <PolarAngleAxis dataKey="subject" tick={{ fill: isDark ? "#a8a29e" : "#64748b", fontSize: 11, fontWeight: 700 }} />
                      <Radar name="Candidate" dataKey="score" stroke="var(--color-radar-stroke)" fill="var(--color-radar-fill)" strokeWidth={2.5} fillOpacity={0.6} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Right Column (Scrollable Content) */}
            <div className="flex-1 space-y-6 w-full">
              {/* Strengths */}
              <div className="border border-slate-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900/40 p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-stone-800/50">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
                  <h3 className="text-base font-black text-slate-900 dark:text-stone-100">{t("key_strengths")}</h3>
                </div>
                <ul className="space-y-4">
                  {payload.key_strengths?.map((s: string, i: number) => (
                    <li key={i} className="flex gap-3 text-[15px] text-slate-700 dark:text-stone-300">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-500 shrink-0 mt-0.5" />
                      <span className="leading-relaxed font-medium">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Weaknesses */}
              <div className="border border-slate-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900/40 p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-stone-800/50">
                  <span className="w-5 h-5 flex items-center justify-center text-amber-600 dark:text-amber-500 font-bold text-sm border-2 border-amber-600/50 dark:border-amber-500/50 rounded-full">!</span>
                  <h3 className="text-base font-black text-slate-900 dark:text-stone-100">{t("key_weaknesses")}</h3>
                </div>
                <ul className="space-y-4">
                  {payload.key_weaknesses?.map((w: string, i: number) => (
                    <li key={i} className="flex gap-3 text-[15px] text-slate-700 dark:text-stone-300">
                      <span className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5 text-lg font-black">•</span>
                      <span className="leading-relaxed font-medium">{w}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Learning Path */}
              {payload.recommended_resources?.length > 0 && (
                <div className="border border-slate-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900/40 p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-stone-800/50">
                    <BookOpen className="w-5 h-5 text-slate-900 dark:text-stone-400" />
                    <h3 className="text-base font-black text-slate-900 dark:text-stone-100">{t("learning_path")}</h3>
                  </div>
                  <ul className="space-y-5">
                    {payload.recommended_resources.map((r: any, i: number) => (
                      <li key={i} className="bg-slate-50 dark:bg-stone-950/50 p-4 rounded-lg border border-slate-100 dark:border-stone-800/50">
                        <a href={r.url} target="_blank" rel="noreferrer" className="text-sm font-bold text-slate-900 dark:text-stone-200 hover:text-[#0a66c2] transition-colors">{r.title}</a>
                        <p className="text-xs text-slate-500 dark:text-stone-400 mt-1.5 leading-relaxed font-medium">{r.reason}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Red Flags */}
              {payload.red_flags?.length > 0 && (
                <div className="border border-red-200 dark:border-red-900/30 rounded-xl bg-red-50 dark:bg-red-950/10 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-red-200 dark:border-red-900/20">
                    <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-500" />
                    <h3 className="text-base font-black text-slate-900 dark:text-stone-100">{t("red_flags")}</h3>
                  </div>
                  <ul className="space-y-4">
                    {payload.red_flags.map((f: string, i: number) => (
                      <li key={i} className="flex gap-3 text-[15px] text-red-800 dark:text-red-300">
                        <span className="text-red-600 dark:text-red-500 shrink-0 font-bold">⚠</span>
                        <span className="leading-relaxed font-medium">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PRINT: PDF Schema */}
      <div className="hidden print:block bg-white text-black font-sans p-10 max-w-[210mm] mx-auto text-sm leading-relaxed" dir="ltr">
        <div className="border-b-2 border-slate-800 pb-6 mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight mb-1">Evaluation Report</h1>
            <h2 className="text-lg font-bold text-slate-600 uppercase tracking-widest">{jobTitle}</h2>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Generated by Autonomous Proctor Studio</p>
            <p>Date: {new Date().toLocaleDateString()}</p>
          </div>
        </div>
        <div className="mb-10 flex gap-8">
          <div className="flex-1">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 border-b border-slate-200 pb-1">Executive Summary</h3>
            <p className="text-slate-800 mt-3 font-medium">Overall competency score: <span className="font-bold text-black">{overallScore}/100</span>.</p>
          </div>
          <div className="w-1/3 shrink-0 border-l-2 border-slate-200 pl-8">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 border-b border-slate-200 pb-1">Recommendation</h3>
            <p className="text-2xl font-black text-slate-900 mt-2 uppercase">{recTranslation()}</p>
          </div>
        </div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-200 pb-1">Competency Breakdown</h3>
        <table className="w-full mb-10 border-collapse">
          <thead><tr className="bg-slate-100 text-left"><th className="py-2 px-4 text-xs font-bold uppercase text-slate-700">Area</th><th className="py-2 px-4 text-xs font-bold uppercase text-slate-700 w-32 text-right">Score</th></tr></thead>
          <tbody>{radarData.map((d, i) => (<tr key={i} className="border-b border-slate-200"><td className="py-2 px-4 font-semibold text-slate-800">{d.subject}</td><td className="py-2 px-4 text-right font-black">{d.score}/100</td></tr>))}</tbody>
        </table>
        <div className="space-y-8">
          <div><h3 className="text-xs font-black uppercase tracking-widest text-emerald-700 mb-3 border-b border-emerald-200 pb-1">Key Strengths</h3><ul className="list-disc pl-5 space-y-2 text-slate-800">{payload.key_strengths?.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>
          <div><h3 className="text-xs font-black uppercase tracking-widest text-amber-700 mb-3 border-b border-amber-200 pb-1">Areas For Improvement</h3><ul className="list-disc pl-5 space-y-2 text-slate-800">{payload.key_weaknesses?.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul></div>
          {payload.red_flags?.length > 0 && <div><h3 className="text-xs font-black uppercase tracking-widest text-rose-700 mb-3 border-b border-rose-200 pb-1">Red Flags</h3><ul className="list-disc pl-5 space-y-2 text-slate-800">{payload.red_flags.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul></div>}
          {payload.recommended_resources?.length > 0 && <div><h3 className="text-xs font-black uppercase tracking-widest text-blue-700 mb-3 border-b border-blue-200 pb-1">Learning Path</h3><ul className="space-y-4 text-slate-800">{payload.recommended_resources.map((r: any, i: number) => <li key={i}><div className="font-bold">{r.title}</div><div className="text-blue-600 text-xs">{r.url}</div><div className="text-slate-600 italic mt-1">{r.reason}</div></li>)}</ul></div>}
        </div>
        <div className="mt-16 pt-4 border-t border-slate-200 text-center text-xs text-slate-400 font-medium uppercase tracking-widest">End of Report</div>
      </div>
    </>
  );
}
