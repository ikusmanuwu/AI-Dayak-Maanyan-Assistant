import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { TelegramSimulator } from './components/TelegramSimulator';
import { KnowledgeBaseExplorer } from './components/KnowledgeBaseExplorer';
import { DynamicMemoryInspector } from './components/DynamicMemoryInspector';
import { CodeViewerAndGuide } from './components/CodeViewerAndGuide';
import { VocabItem, LearnedVocab, ChatMessage, PythonFile, TelegramBotStatus } from './types';
import { INITIAL_VOCABULARY } from './data/initialData';

export function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'vocab' | 'memory' | 'python'>('simulator');
  const [vocabulary, setVocabulary] = useState<VocabItem[]>(INITIAL_VOCABULARY);
  const [learnedVocab, setLearnedVocab] = useState<LearnedVocab[]>([]);
  const [pythonFiles, setPythonFiles] = useState<PythonFile[]>([]);
  const [botStatus, setBotStatus] = useState<TelegramBotStatus | null>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatMode, setChatMode] = useState<'chat' | 'latihan'>('chat');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isMemoryLoading, setIsMemoryLoading] = useState(false);

  // Fetch initial vocab & status
  useEffect(() => {
    fetchVocab();
    fetchBotStatus();
    fetchPythonFiles();
  }, []);

  const fetchVocab = async () => {
    try {
      const res = await fetch('/api/vocab');
      if (res.ok) {
        const data = await res.json();
        if (data.core && Array.isArray(data.core)) {
          setVocabulary(data.core);
        }
        if (data.learned && Array.isArray(data.learned)) {
          setLearnedVocab(data.learned);
        }
      }
    } catch (err) {
      console.warn('Gagal memuat kosakata dari backend:', err);
    }
  };

  const fetchBotStatus = async () => {
    try {
      const res = await fetch('/api/telegram-status');
      if (res.ok) {
        const data = await res.json();
        setBotStatus(data);
      }
    } catch (err) {
      console.warn('Gagal memuat status Telegram:', err);
    }
  };

  const fetchPythonFiles = async () => {
    try {
      const res = await fetch('/api/python-files');
      if (res.ok) {
        const data = await res.json();
        if (data.files) {
          setPythonFiles(data.files);
        }
      }
    } catch (err) {
      console.warn('Gagal memuat file python:', err);
    }
  };

  const handleSendMessage = async (text: string, mode: 'chat' | 'latihan') => {
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          mode: mode,
          history: messages.map((m) => ({ role: m.role, text: m.text }))
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}`);
      }

      const data = await res.json();

      const assistantMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        text: data.reply || "Puang ka'itung... Maaf terjadi kendala.",
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        detectedLearning: data.detectedLearning
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // If auto-learning detected, refresh learned list
      if (data.detectedLearning) {
        fetchVocab();
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        text: 'Maaf, terjadi kesalahan saat menghubungi server AI. Pastikan GEMINI_API_KEY telah dikonfigurasi.',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleAddVocab = async (term: string, meaning: string, category: string, example?: string) => {
    setIsMemoryLoading(true);
    try {
      const res = await fetch('/api/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, meaning, category, example })
      });
      if (res.ok) {
        await fetchVocab();
      }
    } catch (err) {
      console.error('Gagal menambah kosakata:', err);
    } finally {
      setIsMemoryLoading(false);
    }
  };

  const handleResetMemory = async () => {
    if (!confirm('Yakin ingin mereset memori kosakata tambahan?')) return;
    setIsMemoryLoading(true);
    try {
      const res = await fetch('/api/reset-learned', { method: 'POST' });
      if (res.ok) {
        await fetchVocab();
      }
    } catch (err) {
      console.error('Gagal mereset memori:', err);
    } finally {
      setIsMemoryLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100/60 text-stone-900 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        learnedCount={learnedVocab.length}
        botStatus={botStatus}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'simulator' && (
          <TelegramSimulator
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isChatLoading}
            mode={chatMode}
            onModeChange={setChatMode}
          />
        )}

        {activeTab === 'vocab' && (
          <KnowledgeBaseExplorer vocabulary={vocabulary} />
        )}

        {activeTab === 'memory' && (
          <DynamicMemoryInspector
            learnedVocab={learnedVocab}
            onAddVocab={handleAddVocab}
            onResetMemory={handleResetMemory}
            isLoading={isMemoryLoading}
          />
        )}

        {activeTab === 'python' && (
          <CodeViewerAndGuide files={pythonFiles} />
        )}
      </main>
    </div>
  );
}

export default App;
