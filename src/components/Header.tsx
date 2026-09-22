import React, { useState } from 'react';
import { Bot, Sparkles, BookOpen, Database, Code, CheckCircle2, AlertCircle, Play, Square, Loader2 } from 'lucide-react';
import { TelegramBotStatus } from '../types';

interface HeaderProps {
  activeTab: 'simulator' | 'vocab' | 'memory' | 'python';
  onTabChange: (tab: 'simulator' | 'vocab' | 'memory' | 'python') => void;
  learnedCount: number;
  botStatus: TelegramBotStatus | null;
  onToggleBot?: () => Promise<void>;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  learnedCount,
  botStatus,
  onToggleBot
}) => {
  const [isToggling, setIsToggling] = useState(false);
  const isBotActive = botStatus?.status?.isRunning;
  const isConfigured = botStatus?.tokenConfigured;

  const handleToggle = async () => {
    if (!onToggleBot) return;
    setIsToggling(true);
    try {
      await onToggleBot();
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <header className="border-b border-stone-200 bg-white/95 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between py-4 gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-xl bg-amber-700 text-white flex items-center justify-center shadow-sm font-semibold text-lg tracking-wider">
              DM
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold text-stone-900 tracking-tight">
                  Dayak Ma'anyan AI Assistant
                </h1>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-900">
                  Kal-Teng
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Model Bahasa & Bot Cerdas Berbasis Gemini dengan Dynamic Auto-Learning
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Telegram Live Bot Badge */}
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-xs text-stone-700">
              <Bot className="w-4 h-4 text-sky-600" />
              <span>Telegram:</span>
              <a
                href="https://t.me/dayak_maanyan_v2_bot"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-sky-700 hover:underline"
              >
                @dayak_maanyan_v2_bot
              </a>
              {isBotActive ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Active Polling
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                  <AlertCircle className="w-3 h-3 text-amber-500" /> Standby
                </span>
              )}

              {isConfigured && onToggleBot && (
                <button
                  onClick={handleToggle}
                  disabled={isToggling}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer border ${
                    isBotActive
                      ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  }`}
                  title={isBotActive ? "Hentikan long-poller bot" : "Aktifkan long-poller bot sekarang"}
                >
                  {isToggling ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : isBotActive ? (
                    <>
                      <Square className="w-2.5 h-2.5 fill-current" />
                      <span>Stop Bot</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>Nyalakan Bot</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Navigation Tabs */}
            <nav className="flex space-x-1 p-1 bg-stone-100 rounded-lg text-xs font-medium">
              <button
                id="tab-btn-simulator"
                onClick={() => onTabChange('simulator')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                  activeTab === 'simulator'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>AI Simulator</span>
              </button>

              <button
                id="tab-btn-vocab"
                onClick={() => onTabChange('vocab')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                  activeTab === 'vocab'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 text-stone-600" />
                <span>Knowledge Base</span>
              </button>

              <button
                id="tab-btn-memory"
                onClick={() => onTabChange('memory')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                  activeTab === 'memory'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Database className="w-3.5 h-3.5 text-emerald-600" />
                <span>Dynamic Memory</span>
                {learnedCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full text-[10px]">
                    {learnedCount}
                  </span>
                )}
              </button>

              <button
                id="tab-btn-python"
                onClick={() => onTabChange('python')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                  activeTab === 'python'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Code className="w-3.5 h-3.5 text-sky-600" />
                <span>Python & Deploy</span>
              </button>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
};
