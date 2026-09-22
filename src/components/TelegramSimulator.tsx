import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Lightbulb, GraduationCap, MessageSquare, AlertCircle } from 'lucide-react';
import { ChatMessage } from '../types';
import { SAMPLE_QUERIES } from '../data/initialData';

interface TelegramSimulatorProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, mode: 'chat' | 'latihan') => Promise<void>;
  isLoading: boolean;
  mode: 'chat' | 'latihan';
  onModeChange: (mode: 'chat' | 'latihan') => void;
}

export const TelegramSimulator: React.FC<TelegramSimulatorProps> = ({
  messages,
  onSendMessage,
  isLoading,
  mode,
  onModeChange
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    const text = inputText.trim();
    setInputText('');
    onSendMessage(text, mode);
  };

  const handleChipClick = (query: string) => {
    if (isLoading) return;
    onSendMessage(query, mode);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] bg-stone-50 border border-stone-200 rounded-2xl overflow-hidden shadow-xs">
      {/* Simulator Topbar */}
      <div className="bg-white px-5 py-3 border-b border-stone-200 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-sky-600 to-sky-400 flex items-center justify-center text-white">
              <Bot className="w-5 h-5" />
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full"></span>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-semibold text-stone-900">
                Dayak Ma'anyan AI (Live Simulator)
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 font-medium">
                Gemini 3.1 Flash Lite
              </span>
            </div>
            <p className="text-xs text-stone-500">
              {mode === 'chat' ? 'Mode Chat Penutur Asli' : 'Mode Latihan & Kuis Interaktif'}
            </p>
          </div>
        </div>

        {/* Mode Selector Toggle */}
        <div className="flex items-center bg-stone-100 p-1 rounded-xl">
          <button
            id="mode-chat-btn"
            type="button"
            onClick={() => onModeChange('chat')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === 'chat'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
            <span>Chat Alami</span>
          </button>
          <button
            id="mode-latihan-btn"
            type="button"
            onClick={() => onModeChange('latihan')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === 'latihan'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
            <span>Latihan & Kuis</span>
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mb-3">
              <Sparkles className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-stone-900 mb-1">
              Tabe Salamat! Mulai Percakapan
            </h3>
            <p className="text-xs text-stone-500 mb-6 leading-relaxed">
              Tanyakan kosakata, minta terjemahan dua arah, atau ajarkan kata baru dalam bahasa Dayak Ma'anyan (Kal-Teng). Otak AI akan otomatis menyerapnya ke memori dinamis!
            </p>

            <div className="w-full space-y-2 text-left">
              <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                Coba tanyakan contoh ini:
              </p>
              <div className="flex flex-col gap-1.5">
                {SAMPLE_QUERIES.slice(0, 3).map((sq, i) => (
                  <button
                    key={i}
                    onClick={() => handleChipClick(sq)}
                    className="text-xs text-left px-3 py-2 rounded-lg bg-white border border-stone-200 text-stone-700 hover:border-amber-400 hover:bg-amber-50/50 transition-all flex items-center justify-between"
                  >
                    <span>{sq}</span>
                    <Send className="w-3 h-3 text-stone-400 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[75%]">
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-sky-600 text-white flex items-center justify-center shrink-0 mb-1">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-amber-700 text-white rounded-br-xs'
                      : 'bg-white border border-stone-200 text-stone-900 rounded-bl-xs shadow-xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>

                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-amber-800 text-white flex items-center justify-center shrink-0 mb-1">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>

              {/* Detected Auto-Learning Notification Badge */}
              {msg.detectedLearning && (
                <div className="mt-1.5 ml-9 flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 animate-fadeIn">
                  <Lightbulb className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    Auto-Learning Terdeteksi: <strong>{msg.detectedLearning.term}</strong> = <em>{msg.detectedLearning.meaning}</em>
                  </span>
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-stone-500 text-xs pl-2">
            <div className="w-7 h-7 rounded-full bg-sky-600 text-white flex items-center justify-center">
              <Bot className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-white border border-stone-200 px-4 py-2 rounded-2xl rounded-bl-xs shadow-xs text-stone-500">
              Sedang memproses kalimat Dayak Ma'anyan...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Chips */}
      <div className="px-4 py-2 bg-stone-100/70 border-t border-stone-200 flex items-center gap-2 overflow-x-auto text-xs whitespace-nowrap">
        <span className="text-stone-400 text-[11px] font-medium shrink-0">Saran Cepat:</span>
        {SAMPLE_QUERIES.map((sq, i) => (
          <button
            key={i}
            onClick={() => handleChipClick(sq)}
            className="px-2.5 py-1 bg-white border border-stone-200 rounded-full text-stone-600 hover:text-stone-900 hover:border-amber-400 transition-colors shrink-0"
          >
            {sq}
          </button>
        ))}
      </div>

      {/* Chat Input Bar */}
      <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-stone-200 flex items-center gap-2">
        <input
          id="chat-message-input"
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={
            mode === 'chat'
              ? "Tanya terjemahan atau ajarkan kata baru (contoh: 'wusah artinya hujan')..."
              : "Jawab kuis atau minta latihan kata baru..."
          }
          disabled={isLoading}
          className="flex-1 px-4 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 transition-all text-stone-900 placeholder-stone-400"
        />

        <button
          id="send-message-btn"
          type="submit"
          disabled={!inputText.trim() || isLoading}
          className="px-4 py-2.5 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 shadow-xs"
        >
          <span>Kirim</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
