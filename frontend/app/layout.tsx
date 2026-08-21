import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const notoArabic = Noto_Sans_Arabic({
  variable: "--font-noto-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "AI Technical Interviewer — Autonomous Proctor",
  description: "High-fidelity AI-powered technical assessment platform with real-time proctoring, voice agents, and comprehensive evaluation.",
  keywords: ["AI Interview", "Technical Assessment", "Proctor", "LangGraph", "Voice Agent"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${notoArabic.variable} antialiased bg-[#09090b] text-zinc-300 flex items-center justify-center min-h-screen`}>
        <div className="text-center p-8 max-w-md mx-auto">
          <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-900 border border-slate-800">
            <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">Under Maintenance</h1>
          <p className="text-slate-400 mb-8 leading-relaxed">
            We are currently performing scheduled maintenance on AutoHire to upgrade our AI models and infrastructure. We will be back online shortly.
          </p>
          <div className="text-sm font-mono text-slate-600 bg-slate-900/50 py-3 px-4 rounded-lg border border-slate-800/50">
            Status: Upgrading API Services
          </div>
        </div>
      </body>
    </html>
  );
}
