"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import FinalScorecard from "@/components/FinalScorecard";
import { useLanguage } from "@/contexts/LanguageContext";
import { FileCheck, ShieldCheck, ArrowLeft, RotateCcw, AlertTriangle } from "lucide-react";

export default function ScorecardPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params?.sessionId as string;
  const { locale } = useLanguage();
  
  const [payload, setPayload] = useState<any>(null);
  const [jobTitle, setJobTitle] = useState<string>("Senior AI Engineer");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pollingAttempt, setPollingAttempt] = useState(0);

  const isRtl = locale === "ar";
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Pre-fetch session config to obtain exact job title
  useEffect(() => {
    if (!sessionId) return;
    fetch(`${API_URL}/api/session/${sessionId}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.job_title) setJobTitle(data.job_title);
      })
      .catch(() => {});
  }, [sessionId, API_URL]);

  // Polling with backoff
  useEffect(() => {
    if (!sessionId) return;
    let isSubscribed = true;
    let timer: NodeJS.Timeout;

    const fetchScorecard = async () => {
      try {
        const res = await fetch(`${API_URL}/api/scorecard/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data && !data.error && data.technical_depth !== undefined) {
            if (isSubscribed) {
              setPayload(data);
              setLoading(false);
            }
            return;
          }
        }
        
        // Retry polling up to 25 attempts (~50s)
        if (isSubscribed && pollingAttempt < 25) {
          timer = setTimeout(() => {
            setPollingAttempt(p => p + 1);
          }, 2000);
        } else if (isSubscribed) {
          setLoading(false);
          setError(isRtl ? "استغرق استخراج التقييم وقتاً أطول من المتوقع، يرجى المحاولة مرة أخرى." : "Evaluation taking longer than expected. Please retry.");
        }
      } catch (err: any) {
        if (isSubscribed && pollingAttempt < 25) {
          timer = setTimeout(() => {
            setPollingAttempt(p => p + 1);
          }, 2000);
        } else if (isSubscribed) {
          setLoading(false);
          setError(err.message || "Failed to fetch scorecard");
        }
      }
    };
    
    fetchScorecard();

    return () => {
      isSubscribed = false;
      clearTimeout(timer);
    };
  }, [sessionId, pollingAttempt, isRtl, API_URL]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-[#09090b] font-[family-name:var(--font-inter)] text-center p-6 relative overflow-hidden" dir={isRtl ? "rtl" : "ltr"}>
        <div className="ambient-glow w-96 h-96 bg-indigo-600/15 top-1/4" />
        
        <div className="relative z-10 max-w-md w-full glass-panel p-8 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl animate-fade-up">
          <div className="relative w-16 h-16 mx-auto mb-6 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 animate-pulse" />
            <div className="w-12 h-12 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-indigo-600 animate-spin" />
            <FileCheck className="w-5 h-5 text-indigo-500 absolute" />
          </div>

          <h2 className="text-lg font-black text-slate-900 dark:text-white mb-2">
            {isRtl ? "جاري إعداد تقرير التقييم الفني..." : "Preparing Interview Assessment Report..."}
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed mb-6">
            {isRtl 
              ? "جاري تحليل الإجابات واستخراج مؤشرات الأداء ونقاط القوة ومجالات التحسين." 
              : "Analyzing answers, performance indicators, and key competencies."}
          </p>

          <div className="space-y-2">
            <div className="h-1.5 w-full bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500 rounded-full"
                style={{ width: `${Math.min(95, 20 + pollingAttempt * 12)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-400 dark:text-zinc-500">
              <span>{isRtl ? "معالجة التقييم" : "Processing assessment"}</span>
              <span>{Math.min(95, 20 + pollingAttempt * 12)}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#09090b] font-[family-name:var(--font-inter)] p-6" dir={isRtl ? "rtl" : "ltr"}>
        <div className="max-w-md w-full text-center p-8 rounded-2xl glass-panel border border-slate-200 dark:border-white/10 shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
            {isRtl ? "تعذر تحميل النتيجة حالياً" : "Scorecard Generation Notice"}
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mb-6 leading-relaxed">
            {error || (isRtl ? "لم تكتمل عملية التقييم بعد." : "Evaluation details could not be retrieved.")}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5 rtl:flip" />
              <span>{isRtl ? "الرئيسية" : "Home"}</span>
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isRtl ? "إعادة المحاولة" : "Retry"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const effectiveJob = payload.job_role || payload.role || jobTitle || "Senior AI Engineer";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 font-[family-name:var(--font-inter)]">
      <FinalScorecard payload={payload} jobTitle={effectiveJob} />
    </div>
  );
}
