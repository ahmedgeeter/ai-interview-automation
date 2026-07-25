"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";

import { useInterview } from "@/hooks/useInterview";

import { Header, InputArea } from "@/components/interview/InterviewLayout";
import { JellyButton } from "@/components/interview/JellyButton";
import { InspectorPanel } from "@/components/interview/InspectorPanel";

export default function InterviewPage() {
  const params = useParams();
  const sessionId = params?.sessionId as string;

  const { locale, toggleLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();

  const [inputValue, setInputValue] = useState("");
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [showVoiceLangMenu, setShowVoiceLangMenu] = useState(false);
  
  const [voiceLang, setVoiceLang] = useState<"en" | "ar">("en");
  const [jobTitle, setJobTitle] = useState(""); // Can be fetched or derived in future
  
  const [limitMode, setLimitMode] = useState<"time" | "questions">("questions");
  const [limitValue, setLimitValue] = useState(5);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const {
    messages, isConnected, isTyping, isAiSpeaking, isListening,
    questionCount, liveScores, telemetry,
    sendMessage, sendEndInterview, changeLanguage,
    toggleListening, stopListening, stopCurrentAudio, setIsAiSpeaking
  } = useInterview(
    sessionId, 
    isVoiceMuted,
    voiceLang,
    (text) => setInputValue(prev => prev + text)
  );

  // Handlers
  const handleSend = () => {
    if (!inputValue.trim()) return;
    sendMessage(inputValue);
    setInputValue("");
    stopListening();
  };

  const handleVoiceLangChange = (lang: "en" | "ar") => {
    setVoiceLang(lang);
    setShowVoiceLangMenu(false);
    changeLanguage(lang);
  };

  const toggleTheme = () => {
    if (theme === "dark") setTheme("light");
    else if (theme === "light") setTheme("system");
    else setTheme("dark");
  };

  if (!sessionId) return null;
  const isRtl = locale === "ar";

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-stone-950 noise-bg text-slate-800 dark:text-stone-300 font-[family-name:var(--font-inter)] overflow-hidden" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex-1 flex flex-col relative">
        <Header 
          isConnected={isConnected} 
          theme={theme as string} 
          locale={locale} 
          voiceLang={voiceLang}
          showVoiceLangMenu={showVoiceLangMenu}
          setShowVoiceLangMenu={setShowVoiceLangMenu}
          toggleTheme={toggleTheme}
          toggleLanguage={toggleLanguage}
          changeVoiceLang={handleVoiceLangChange}
          t={t}
        />
        
        <main className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
          <div className="jelly-bg" />
          <JellyButton 
            isAiSpeaking={isAiSpeaking}
            isListening={isListening}
            messages={messages}
            isTyping={isTyping}
            t={t}
            toggleListening={toggleListening}
          />
        </main>
        
        <InputArea 
          inputValue={inputValue}
          setInputValue={setInputValue}
          isListening={isListening}
          toggleListening={toggleListening}
          handleSend={handleSend}
          t={t}
        />
      </div>

      <InspectorPanel 
        jobTitle={jobTitle}
        sessionId={sessionId}
        isAiSpeaking={isAiSpeaking}
        voiceLang={voiceLang}
        locale={locale}
        telemetry={telemetry}
        liveScores={liveScores}
        isVoiceMuted={isVoiceMuted}
        limitMode={limitMode}
        limitValue={limitValue}
        timeLeft={timeLeft}
        questionCount={questionCount}
        t={t}
        setIsVoiceMuted={setIsVoiceMuted}
        stopCurrentAudio={stopCurrentAudio}
        setIsAiSpeaking={setIsAiSpeaking}
        handleEnd={sendEndInterview}
      />
    </div>
  );
}
