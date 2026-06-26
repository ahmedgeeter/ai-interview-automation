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
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${notoArabic.variable} antialiased bg-[#09090b] text-zinc-300 transition-colors duration-300`}
      >
        <ThemeProvider>
          <LanguageProvider>
            {children}
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
