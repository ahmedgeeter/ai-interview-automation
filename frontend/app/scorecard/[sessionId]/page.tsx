"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import FinalScorecard from "@/components/FinalScorecard";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ScorecardPage() {
  const params = useParams();
  const sessionId = params?.sessionId as string;
  const { t } = useLanguage();
  
  const [payload, setPayload] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    
    const fetchScorecard = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${API_URL}/api/scorecard/${sessionId}`);
        const data = await res.json();
        
        if (data.error) {
          setError(data.error);
        } else {
          setPayload(data);
        }
      } catch (err) {
        setError("Failed to load scorecard");
      } finally {
        setLoading(false);
      }
    };
    
    fetchScorecard();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-stone-950 font-[family-name:var(--font-inter)]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
          <div className="w-2 h-2 rounded-full bg-slate-400 animate-pulse delay-75" />
          <div className="w-2 h-2 rounded-full bg-slate-400 animate-pulse delay-150" />
        </div>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-stone-950 font-[family-name:var(--font-inter)] text-slate-500">
        <p>{error || "Scorecard not available."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-stone-950 text-slate-900 dark:text-stone-50 font-[family-name:var(--font-inter)]">
      <FinalScorecard payload={payload} jobTitle={payload.role || "Candidate"} />
    </div>
  );
}
