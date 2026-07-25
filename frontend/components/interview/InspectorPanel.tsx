import React from "react";
import { Volume2, VolumeX, Square, Activity } from "lucide-react";
import { Telemetry, LiveScores } from "@/hooks/useInterview";

interface InspectorPanelProps {
  jobTitle: string;
  sessionId: string;
  isAiSpeaking: boolean;
  voiceLang: "en" | "ar";
  locale: string;
  telemetry: Telemetry;
  liveScores: LiveScores | null;
  isVoiceMuted: boolean;
  limitMode: "time" | "questions";
  limitValue: number;
  timeLeft: number | null;
  questionCount: number;
  t: (key: string) => string;
  setIsVoiceMuted: (val: boolean) => void;
  stopCurrentAudio: () => void;
  setIsAiSpeaking: (val: boolean) => void;
  handleEnd: () => void;
}

export function InspectorPanel({
  jobTitle, sessionId, isAiSpeaking, voiceLang, locale, telemetry, liveScores,
  isVoiceMuted, limitMode, limitValue, timeLeft, questionCount, t,
  setIsVoiceMuted, stopCurrentAudio, setIsAiSpeaking, handleEnd
}: InspectorPanelProps) {
  
  const handleMuteToggle = () => {
    setIsVoiceMuted(!isVoiceMuted);
    if (!isVoiceMuted) {
      stopCurrentAudio();
      setIsAiSpeaking(false);
    }
  };

  return (
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
        <button onClick={handleMuteToggle}
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
  );
}
