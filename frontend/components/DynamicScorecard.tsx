"use client";

import React from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { Activity, ShieldAlert } from "lucide-react";

interface DynamicScorecardProps {
  questionCount: number;
  maxQuestions: number;
  cheatSignals: number;
}

export default function DynamicScorecard({ questionCount, maxQuestions, cheatSignals }: DynamicScorecardProps) {
  // Dynamically calculate mock data based on progress to create the illusion of live analysis
  const progress = Math.min(questionCount / maxQuestions, 1);
  
  const data = [
    { subject: 'Code Quality', A: 50 + (progress * 35) + (Math.random() * 5), fullMark: 100 },
    { subject: 'Architecture', A: 40 + (progress * 40) + (Math.random() * 5), fullMark: 100 },
    { subject: 'Problem Solving', A: 60 + (progress * 25) + (Math.random() * 5), fullMark: 100 },
    { subject: 'Integrity', A: 100 - (cheatSignals * 30), fullMark: 100 },
    { subject: 'Communication', A: 70 + (progress * 10) + (Math.random() * 5), fullMark: 100 },
  ];

  return (
    <div className="flex flex-col h-full bg-[var(--background)] font-[family-name:var(--font-inter)] p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-[var(--color-secondary)]" />
            Live Analytics
          </h2>
          <p className="text-sm text-gray-400 mt-1">Real-time competency mapping</p>
        </div>
        
        <div className="glass-panel px-4 py-2 rounded-full flex items-center gap-2 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse"></span>
          ANALYZING
        </div>
      </div>

      {cheatSignals > 0 && (
        <div className="mb-6 p-4 rounded-lg bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-[var(--color-danger)] shrink-0 mt-0.5" />
          <div>
            <h4 className="text-[var(--color-danger)] font-semibold text-sm">Integrity Alert</h4>
            <p className="text-xs text-[var(--color-danger)]/70 mt-1">
              Tab-switching detected. Contextual penalization applied to evaluation metrics.
            </p>
          </div>
        </div>
      )}

      {/* Radar Chart Container */}
      <div className="w-full aspect-square max-h-[400px] mb-8 glass-panel rounded-2xl flex items-center justify-center p-4">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
            <PolarGrid stroke="rgba(255,255,255,0.1)" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar
              name="Candidate"
              dataKey="A"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fill="var(--color-primary)"
              fillOpacity={0.2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Progress indicators */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-widest">Interview Progress</h3>
        
        <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
          <div 
            className="bg-gradient-to-r from-[var(--color-secondary)] to-[var(--color-primary)] h-2 transition-all duration-1000 ease-out"
            style={{ width: `${(questionCount / maxQuestions) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>Question {questionCount} of {maxQuestions}</span>
          <span>{Math.round((questionCount / maxQuestions) * 100)}% Complete</span>
        </div>
      </div>
    </div>
  );
}
