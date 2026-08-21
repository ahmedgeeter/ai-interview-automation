import React from "react";
import { Volume2, VolumeX, Square, Activity, Cpu, Zap, Timer, CheckCircle, BrainCircuit } from "lucide-react";
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
  t: any;
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

  const isRtl = locale === "ar";
  
  // Progress calculations
  let progressPercent = 0;
  if (limitMode === "time" && timeLeft !== null) {
    progressPercent = Math.max(0, (timeLeft / (limitValue * 60)) * 100);
  } else {
    progressPercent = Math.min(100, Math.round((questionCount / limitValue) * 100));
  }

  return (
    <div className="hidden lg:flex w-80 bg-white/60 dark:bg-stone-950/60 backdrop-blur-2xl flex-col border-s border-white/20 dark:border-white/5 shadow-2xl relative z-10">
      
      {/* Decorative gradient orb */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 dark:bg-blue-500/20 rounded-full blur-3xl -z-10 mix-blend-multiply dark:mix-blend-lighten pointer-events-none" />

      {/* Header Info */}
      <div className="px-6 py-7 border-b border-slate-200/50 dark:border-stone-800/50">
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-widest mb-3">
          <Activity className="w-3 h-3" />
          <span>{isRtl ? "جلسة مباشرة" : "Live Session"}</span>
        </div>
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight mb-1">{jobTitle}</h2>
        <div className="text-[11px] text-slate-500 dark:text-stone-500 font-mono flex items-center gap-2">
          <span>ID: {sessionId.substring(0, 8).toUpperCase()}</span>
          <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-stone-700" />
          <span className="uppercase">{limitMode} Mode</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
        
        {/* Agent Status */}
        <section>
          <h3 className="text-[10px] font-bold text-slate-400 dark:text-stone-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <BrainCircuit className="w-3.5 h-3.5" />
            {isRtl ? "حالة الوكيل" : "Agent Status"}
          </h3>
          <div className={`relative overflow-hidden rounded-2xl border p-5 flex flex-col items-center justify-center transition-all duration-500 ${isAiSpeaking ? "bg-gradient-to-b from-blue-50/50 to-white dark:from-blue-900/10 dark:to-stone-900/50 border-blue-200 dark:border-blue-800/50 shadow-[0_0_30px_-5px_rgba(59,130,246,0.15)]" : "bg-white/50 dark:bg-stone-900/30 border-slate-200/50 dark:border-stone-800/50"}`}>
            
            <div className="relative mb-3">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center relative z-10 transition-colors duration-500 ${isAiSpeaking ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30" : "bg-slate-100 dark:bg-stone-800 text-slate-400 dark:text-stone-500"}`}>
                <Volume2 className="w-6 h-6" />
              </div>
              {isAiSpeaking && (
                <>
                  <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20" />
                  <div className="absolute -inset-4 border border-blue-500/30 rounded-full animate-[spin_3s_linear_infinite]" />
                </>
              )}
            </div>
            
            <span className={`text-xs font-bold uppercase tracking-wider ${isAiSpeaking ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-stone-500"}`}>
              {isAiSpeaking ? (voiceLang === "ar" ? "يتحدث الآن..." : "Speaking...") : (voiceLang === "ar" ? "صامت" : "Silent")}
            </span>
          </div>
        </section>

        {/* Telemetry */}
        <section>
          <h3 className="text-[10px] font-bold text-slate-400 dark:text-stone-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5" />
            {isRtl ? "استهلاك النظام" : "Telemetry"}
          </h3>
          
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="bg-white/50 dark:bg-stone-900/50 rounded-xl p-3.5 border border-slate-200/50 dark:border-stone-800/50 shadow-sm">
              <div className="text-[9px] text-slate-400 dark:text-stone-500 font-bold uppercase mb-2">Prompt</div>
              <div className="text-base font-mono font-semibold text-slate-800 dark:text-stone-200">+{telemetry.prompt}</div>
              <div className="text-[9px] text-slate-500 dark:text-stone-400 mt-2 flex justify-between border-t border-slate-100 dark:border-stone-800 pt-2">
                <span className="font-bold">{telemetry.totalPrompt}</span>
              </div>
            </div>
            <div className="bg-white/50 dark:bg-stone-900/50 rounded-xl p-3.5 border border-slate-200/50 dark:border-stone-800/50 shadow-sm">
              <div className="text-[9px] text-slate-400 dark:text-stone-500 font-bold uppercase mb-2">Completion</div>
              <div className="text-base font-mono font-semibold text-emerald-600 dark:text-emerald-400">+{telemetry.completion}</div>
              <div className="text-[9px] text-slate-500 dark:text-stone-400 mt-2 flex justify-between border-t border-slate-100 dark:border-stone-800 pt-2">
                <span className="font-bold">{telemetry.totalCompletion}</span>
              </div>
            </div>
            <div className="bg-white/50 dark:bg-stone-900/50 rounded-xl p-3.5 border border-slate-200/50 dark:border-stone-800/50 shadow-sm">
              <div className="text-[9px] text-slate-400 dark:text-stone-500 font-bold uppercase mb-2">Voice Chars</div>
              <div className="text-base font-mono font-semibold text-blue-600 dark:text-blue-400">+{telemetry.voiceTokens}</div>
              <div className="text-[9px] text-slate-500 dark:text-stone-400 mt-2 flex justify-between border-t border-slate-100 dark:border-stone-800 pt-2">
                <span className="font-bold">{telemetry.totalVoiceTokens}</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white/50 dark:bg-stone-900/50 rounded-xl p-3.5 border border-slate-200/50 dark:border-stone-800/50 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-500">
                <Zap className="w-3.5 h-3.5" />
              </div>
              <div className="text-[10px] text-slate-600 dark:text-stone-400 font-bold uppercase">Latency (TTFB)</div>
            </div>
            <div className={`text-sm font-mono font-bold ${telemetry.latency > 2000 ? 'text-red-500' : 'text-amber-500'}`}>
              {telemetry.latency}ms
            </div>
          </div>
        </section>

        {/* Live Metrics */}
        <section>
          <h3 className="text-[10px] font-bold text-slate-400 dark:text-stone-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5" />
            {isRtl ? "التقييم اللحظي" : "Live Metrics"}
          </h3>
          
          {liveScores ? (
            <div className="bg-white/50 dark:bg-stone-900/50 rounded-xl p-4 border border-slate-200/50 dark:border-stone-800/50 shadow-sm space-y-4">
              {[
                { label: isRtl ? "العمق التقني" : "Technical", val: liveScores.technical, color: "bg-blue-500" },
                { label: isRtl ? "حل المشكلات" : "Problem Solving", val: liveScores.problem_solving, color: "bg-purple-500" },
                { label: isRtl ? "التواصل" : "Communication", val: liveScores.communication, color: "bg-emerald-500" },
              ].map((m, i) => (
                <div key={i}>
                  <div className="flex justify-between text-[11px] font-bold text-slate-600 dark:text-stone-300 mb-2">
                    <span>{m.label}</span>
                    <span className="font-mono">{m.val}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-stone-800/80 rounded-full overflow-hidden" dir="ltr">
                    <div className={`h-full ${m.color} rounded-full transition-all duration-1000 ease-out`} style={{ width: `${m.val}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-32 bg-white/30 dark:bg-stone-900/30 rounded-xl border border-dashed border-slate-300 dark:border-stone-700 flex items-center justify-center">
              <div className="text-xs text-slate-400 dark:text-stone-500 font-medium flex flex-col items-center gap-2">
                <div className="w-4 h-4 border-2 border-slate-300 dark:border-stone-600 border-t-slate-400 rounded-full animate-spin" />
                {isRtl ? "في انتظار البيانات..." : "Awaiting data..."}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Footer Controls */}
      <div className="p-6 bg-slate-50/80 dark:bg-stone-950/80 backdrop-blur-xl border-t border-slate-200/50 dark:border-stone-800/50">
        
        {/* Progress Indicator */}
        <div className="mb-5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500 dark:text-stone-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5" />
              {t("interview_progress")}
            </span>
            <span className="text-slate-900 dark:text-stone-200 bg-white dark:bg-stone-800 px-2 py-0.5 rounded shadow-sm border border-slate-200 dark:border-stone-700">
              {limitMode === "time" && timeLeft !== null 
                ? `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}` 
                : `${questionCount} / ${limitValue}`}
            </span>
          </div>
          <div className="h-2 w-full bg-slate-200/50 dark:bg-stone-800/80 rounded-full overflow-hidden p-0.5" dir="ltr">
            <div 
              className="h-full bg-slate-800 dark:bg-stone-300 rounded-full transition-all duration-1000 ease-out" 
              style={{ width: `${progressPercent}%` }} 
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <button onClick={handleMuteToggle}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-xs font-bold transition-all ${isVoiceMuted ? "bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200/50 dark:border-red-900/50" : "bg-white hover:bg-slate-50 dark:bg-stone-900 dark:hover:bg-stone-800 text-slate-700 dark:text-stone-300 border border-slate-200/50 dark:border-stone-800/80 shadow-sm"}`}>
            {isVoiceMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            {isVoiceMuted ? t("agent_muted") : t("mute_agent")}
          </button>
          <button onClick={handleEnd}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-stone-200 text-white dark:text-stone-900 shadow-md transition-all">
            <Square className="w-4 h-4" />
            {t("end_session")}
          </button>
        </div>
      </div>
    </div>
  );
}

