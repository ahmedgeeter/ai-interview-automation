import React, { useState, useEffect } from "react";
import { Moon, Sun, Languages, ChevronDown, Mic, MicOff, Send } from "lucide-react";

// --- Header Component ---
export function Header({
  isConnected, theme, locale, voiceLang, showVoiceLangMenu,
  setShowVoiceLangMenu, toggleTheme, toggleLanguage, changeVoiceLang, t
}: any) {
  return (
    <header className="h-12 border-b border-slate-200 dark:border-stone-800/40 flex items-center justify-between px-5 shrink-0 bg-white/50 dark:bg-stone-950/50 backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`} />
        <span className="text-[11px] font-semibold text-slate-500 dark:text-stone-500">{isConnected ? t("uplink_on") : t("uplink_off")}</span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={toggleTheme} className="flex items-center justify-center w-6 h-6 rounded border border-transparent hover:border-slate-200 dark:hover:border-stone-800 text-slate-400 dark:text-stone-500 transition-colors">
          {theme === "dark" ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
        </button>
        <button onClick={toggleLanguage} className="text-[11px] font-semibold text-slate-500 dark:text-stone-500 hover:text-slate-900 dark:hover:text-stone-200 transition-colors px-2 py-1 rounded border border-transparent hover:border-slate-200 dark:hover:border-stone-800">
          {locale === "en" ? "AR" : "EN"}
        </button>
        <div className="relative">
          <button onClick={() => setShowVoiceLangMenu(!showVoiceLangMenu)} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-stone-400 hover:text-slate-900 dark:hover:text-stone-200 transition-colors px-2 py-1 rounded border border-slate-200 dark:border-stone-800 bg-white dark:bg-stone-900/50">
            <Languages className="w-3.5 h-3.5" />
            {voiceLang === "en" ? "EN" : "AR"}
            <ChevronDown className="w-3 h-3" />
          </button>
          {showVoiceLangMenu && (
            <div className="absolute top-full mt-1 end-0 bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 rounded-md shadow-xl z-50 min-w-[120px] overflow-hidden">
              <button onClick={() => changeVoiceLang("en")} className="w-full text-start px-4 py-2 text-xs font-semibold flex items-center gap-2 text-slate-500 dark:text-stone-400 hover:bg-slate-50 dark:hover:bg-stone-800/50">English</button>
              <button onClick={() => changeVoiceLang("ar")} className="w-full text-start px-4 py-2 text-xs font-semibold flex items-center gap-2 text-slate-500 dark:text-stone-400 hover:bg-slate-50 dark:hover:bg-stone-800/50">عربي</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// --- Typewriter Component ---
export function TypewriterText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    let i = 0;
    setDisplayed("");
    const interval = setInterval(() => {
      setDisplayed(text.substring(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, 25);
    return () => clearInterval(interval);
  }, [text]);
  return <span>{displayed}</span>;
}

// --- Input Area Component ---
export function InputArea({ inputValue, setInputValue, isListening, toggleListening, handleSend, t }: any) {
  return (
    <div className="absolute bottom-8 inset-x-0 flex justify-center z-20 px-6">
      <div className="w-full max-w-2xl flex items-end bg-white/80 dark:bg-stone-900/80 backdrop-blur-xl border border-slate-200/50 dark:border-stone-800/50 rounded-2xl shadow-xl p-2.5 transition-all">
        <button onClick={toggleListening} className={`p-3 rounded-xl transition-colors shrink-0 ${isListening ? "text-white bg-emerald-500 shadow-lg shadow-emerald-500/30" : "text-slate-500 dark:text-stone-400 hover:bg-slate-100 dark:hover:bg-stone-800"}`}>
          {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
        <textarea 
          value={inputValue} 
          onChange={e => { setInputValue(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }} 
          dir="auto" rows={1}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); e.currentTarget.style.height = 'auto'; } }}
          placeholder={isListening ? t("dictation_active") : t("input_placeholder")}
          className="flex-1 bg-transparent py-3 px-4 text-[15px] font-medium text-slate-900 dark:text-stone-50 focus:outline-none placeholder:text-slate-400 dark:placeholder:text-stone-600 resize-none overflow-y-auto" />
        <button onClick={handleSend} disabled={!inputValue.trim()} className="p-3 rounded-xl text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:bg-slate-300 dark:disabled:bg-stone-800 transition-colors shrink-0 shadow-lg shadow-blue-500/20 disabled:shadow-none">
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
