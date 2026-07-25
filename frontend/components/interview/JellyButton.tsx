import React from "react";
import { Mic, Volume2, Activity } from "lucide-react";
import { TypewriterText } from "./InterviewLayout";
import { Message } from "@/hooks/useInterview";

interface JellyButtonProps {
  isAiSpeaking: boolean;
  isListening: boolean;
  messages: Message[];
  isTyping: boolean;
  t: (key: string) => string;
  toggleListening: () => void;
}

export function JellyButton({ isAiSpeaking, isListening, messages, isTyping, t, toggleListening }: JellyButtonProps) {
  const aiMessages = messages.filter(m => m.role === 'ai');
  const lastAiMessage = aiMessages.length > 0 ? aiMessages[aiMessages.length - 1].content : "";

  return (
    <div className="relative z-10 flex flex-col items-center justify-center mb-20 w-full max-w-2xl px-6">
      <button 
        onClick={toggleListening}
        className={`w-48 h-48 sm:w-64 sm:h-64 rounded-[50%] flex items-center justify-center text-white transition-all duration-500 shadow-2xl ${
          isAiSpeaking 
            ? "bg-gradient-to-tr from-blue-500 to-purple-500 animate-jelly-active" 
            : isListening
            ? "bg-gradient-to-tr from-emerald-400 to-teal-500 animate-jelly shadow-emerald-500/50"
            : "bg-gradient-to-tr from-slate-800 to-slate-700 dark:from-stone-800 dark:to-stone-700 animate-jelly shadow-slate-900/20"
        }`}
      >
        {isAiSpeaking ? (
          <Volume2 className="w-16 h-16 sm:w-20 sm:h-20 opacity-90 animate-pulse" />
        ) : isListening ? (
          <Mic className="w-16 h-16 sm:w-20 sm:h-20 opacity-90 animate-pulse" />
        ) : (
          <Activity className="w-16 h-16 sm:w-20 sm:h-20 opacity-50" />
        )}
      </button>
      
      <div className="mt-12 text-center min-h-[80px] w-full z-10">
        {aiMessages.length > 0 ? (
          <p className="text-lg sm:text-xl font-semibold text-slate-800 dark:text-stone-200 transition-opacity duration-300 leading-relaxed" dir="auto">
            <TypewriterText text={lastAiMessage} />
          </p>
        ) : (
          <p className="text-lg font-medium text-slate-400 dark:text-stone-500">{t("waiting_for_agent")}</p>
        )}
      </div>
      
      {isTyping && (
        <div className="mt-4 text-xs font-bold text-slate-400 dark:text-stone-600 animate-pulse">
          {t("processing")}
        </div>
      )}
    </div>
  );
}
