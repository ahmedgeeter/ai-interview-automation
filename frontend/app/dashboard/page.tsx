"use client";

import React, { useEffect, useState, useRef } from "react";
import { Activity, Coins, Users, Zap, Terminal } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import { useTheme } from "@/contexts/ThemeContext";

interface GlobalStats {
  active_sessions: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_cost: number;
}

interface ChartDataPoint {
  time: string;
  promptTokens: number;
  completionTokens: number;
}

export default function DashboardPage() {
  const { theme } = useTheme();
  
  const [stats, setStats] = useState<GlobalStats>({
    active_sessions: 0,
    total_prompt_tokens: 0,
    total_completion_tokens: 0,
    total_cost: 0.0
  });

  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const connectWebSocket = () => {
      const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "wss://ai-interview-automation.onrender.com";
      // Ensure we hit localhost in dev if not set properly, fallback handling:
      let finalUrl = WS_URL;
      if (window.location.hostname === "localhost") {
        finalUrl = "ws://localhost:8000";
      }

      const ws = new WebSocket(`${finalUrl}/ws/dashboard`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "dashboard_init" || data.type === "dashboard_update") {
            const newStats = data.stats as GlobalStats;
            setStats(newStats);
            
            if (data.type === "dashboard_update") {
              const now = new Date();
              const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              setChartData(prev => {
                const newData = [...prev, {
                  time: timeStr,
                  promptTokens: newStats.total_prompt_tokens,
                  completionTokens: newStats.total_completion_tokens
                }];
                // Keep last 30 data points
                return newData.length > 30 ? newData.slice(newData.length - 30) : newData;
              });
            }
          }
        } catch (e) {
          console.error("Failed to parse dashboard message", e);
        }
      };

      ws.onclose = () => {
        setTimeout(connectWebSocket, 3000); // Reconnect
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const StatCard = ({ title, value, icon: Icon, colorClass }: { title: string, value: string | number, icon: any, colorClass: string }) => (
    <div className="bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 rounded-2xl p-6 shadow-sm flex items-center space-x-4">
      <div className={`p-4 rounded-xl ${colorClass}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500 dark:text-stone-400">{title}</p>
        <h3 className="text-2xl font-bold text-slate-800 dark:text-stone-100">{value}</h3>
      </div>
    </div>
  );

  const isDark = theme === "dark" || (theme === "system" && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-stone-950 text-slate-900 dark:text-stone-100 p-8 font-[family-name:var(--font-inter)]">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Activity className="w-8 h-8 text-blue-500" />
              API Operations Dashboard
            </h1>
            <p className="text-slate-500 dark:text-stone-400 mt-2">Real-time telemetry and cost tracking for AI Interview sessions</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Live Updates Active
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="Active Sessions" 
            value={stats.active_sessions} 
            icon={Users} 
            colorClass="bg-gradient-to-br from-blue-500 to-indigo-600" 
          />
          <StatCard 
            title="Total Cost (Est.)" 
            value={`$${stats.total_cost.toFixed(4)}`} 
            icon={Coins} 
            colorClass="bg-gradient-to-br from-emerald-400 to-teal-500" 
          />
          <StatCard 
            title="Prompt Tokens" 
            value={stats.total_prompt_tokens.toLocaleString()} 
            icon={Terminal} 
            colorClass="bg-gradient-to-br from-purple-500 to-pink-500" 
          />
          <StatCard 
            title="Completion Tokens" 
            value={stats.total_completion_tokens.toLocaleString()} 
            icon={Zap} 
            colorClass="bg-gradient-to-br from-orange-400 to-red-500" 
          />
        </div>

        {/* Charts */}
        <div className="bg-white dark:bg-stone-900 border border-slate-200 dark:border-stone-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold mb-6">Real-Time Token Usage Growth</h2>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#292524" : "#e2e8f0"} />
                <XAxis dataKey="time" stroke={isDark ? "#a8a29e" : "#64748b"} />
                <YAxis stroke={isDark ? "#a8a29e" : "#64748b"} />
                <Tooltip 
                  contentStyle={{ backgroundColor: isDark ? '#1c1917' : '#fff', borderColor: isDark ? '#292524' : '#e2e8f0' }}
                  itemStyle={{ color: isDark ? '#e7e5e4' : '#1e293b' }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="promptTokens" 
                  name="Prompt Tokens"
                  stroke="#a855f7" 
                  strokeWidth={3}
                  activeDot={{ r: 8 }} 
                  isAnimationActive={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="completionTokens" 
                  name="Completion Tokens"
                  stroke="#f97316" 
                  strokeWidth={3}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {chartData.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-stone-500">
              Waiting for session telemetry...
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
