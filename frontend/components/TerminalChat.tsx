"use client";

import React, { useEffect, useRef, useState } from "react";
import { Terminal, Send, AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";

type Message = {
  role: "system" | "user" | "ai";
  content: string;
};

interface TerminalChatProps {
  messages: Message[];
  onSendMessage: (msg: string) => void;
  isTyping: boolean;
  isConnected: boolean;
}

export default function TerminalChat({ messages, onSendMessage, isTyping, isConnected }: TerminalChatProps) {
  const [input, setInput] = useState("");
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isConnected) return;
    onSendMessage(input);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] font-[family-name:var(--font-fira)] text-sm border-r border-white/5 relative">
      {/* Header */}
      <div className="flex items-center px-4 py-3 bg-black/40 border-b border-white/10 shrink-0">
        <Terminal className="w-4 h-4 text-[var(--color-primary)] mr-2" />
        <span className="text-gray-300 font-semibold tracking-wider">AI_ENGINEER_SHELL_v1.0</span>
        
        {!isConnected && (
          <div className="ml-auto flex items-center text-orange-400 text-xs animate-pulse">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Reconnecting...
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 terminal-scroll space-y-6">
        <div className="text-gray-500 mb-6">
          $ Initialize assessment protocol...<br/>
          $ Connection established.<br/>
          $ Warning: Tab-switching is monitored. Maintain focus.<br/>
          ==================================================
        </div>

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
            <span className={`text-xs mb-1 opacity-50 ${msg.role === "user" ? "text-right" : "text-left"}`}>
              {msg.role === "user" ? "YOU" : "SYSTEM"}
            </span>
            <div 
              className={`max-w-[85%] rounded-md p-3 whitespace-pre-wrap leading-relaxed overflow-x-auto
                ${msg.role === "user" 
                  ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20" 
                  : "bg-white/5 text-gray-300 border border-white/10"
                }`}
            >
              {msg.role === "ai" ? (
                <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 prose-p:leading-relaxed prose-code:text-[var(--color-primary)]">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex flex-col items-start">
            <span className="text-xs mb-1 opacity-50">SYSTEM</span>
            <div className="bg-white/5 border border-white/10 text-gray-300 rounded-md p-3 flex items-center gap-1 w-16 h-10">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></span>
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></span>
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></span>
            </div>
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      {/* Input Area */}
      <div className="shrink-0 p-4 bg-black/40 border-t border-white/10">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <span className="absolute left-3 text-[var(--color-primary)]">~ $</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!isConnected}
            className="w-full bg-black/50 border border-white/10 rounded-md py-3 pl-10 pr-12 text-gray-200 focus:outline-none focus:border-[var(--color-primary)]/50 transition-colors disabled:opacity-50"
            placeholder="Type your response... (Code allowed)"
          />
          <button 
            type="submit" 
            disabled={!isConnected || !input.trim()}
            className="absolute right-3 p-1 text-gray-400 hover:text-[var(--color-primary)] transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
