import React, { useState } from 'react';
import { Code, Copy, Check, FileCode, Terminal, ExternalLink, HelpCircle, Layers, ShieldCheck } from 'lucide-react';
import { PythonFile } from '../types';

interface CodeViewerAndGuideProps {
  files: PythonFile[];
}

export const CodeViewerAndGuide: React.FC<CodeViewerAndGuideProps> = ({ files }) => {
  const [selectedFile, setSelectedFile] = useState<string>(files[0]?.filename || 'bot.py');
  const [copied, setCopied] = useState(false);

  const active = files.find((f) => f.filename === selectedFile) || files[0];

  const handleCopy = () => {
    if (active?.content) {
      navigator.clipboard.writeText(active.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-sky-950 text-white rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-xs">
        <div className="relative z-10 max-w-2xl">
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-sky-800 text-sky-200 uppercase tracking-wide">
            Source Code & Deploy Guide
          </span>
          <h2 className="text-2xl font-bold mt-2 mb-2 tracking-tight">
            Telegram Bot Python & Deployment
          </h2>
          <p className="text-sm text-sky-100/90 leading-relaxed">
            Bot ini dapat berjalan langsung di web/cloud (Node.js via Railway) atau dijalankan sebagai daemon Python mandiri di VPS/Server Anda.
          </p>
        </div>
      </div>

      {/* Guide Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs space-y-2">
          <div className="flex items-center space-x-2 text-sky-700 font-semibold text-sm">
            <Terminal className="w-4 h-4" />
            <h3>1. Siapkan Token</h3>
          </div>
          <p className="text-xs text-stone-600 leading-relaxed">
            Dapatkan bot token dari <code className="bg-stone-100 px-1 py-0.5 rounded text-stone-800">@BotFather</code> di Telegram, dan dapatkan API Key dari Google AI Studio.
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs space-y-2">
          <div className="flex items-center space-x-2 text-emerald-700 font-semibold text-sm">
            <ShieldCheck className="w-4 h-4" />
            <h3>2. Environment Variables</h3>
          </div>
          <p className="text-xs text-stone-600 leading-relaxed">
            Pasang 2 variabel penting di Railway atau file .env: <code className="bg-stone-100 px-1 py-0.5 rounded text-stone-800">TELEGRAM_BOT_TOKEN</code> dan <code className="bg-stone-100 px-1 py-0.5 rounded text-stone-800">GEMINI_API_KEY</code>.
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs space-y-2">
          <div className="flex items-center space-x-2 text-amber-700 font-semibold text-sm">
            <ExternalLink className="w-4 h-4" />
            <h3>3. Jalankan 24/7</h3>
          </div>
          <p className="text-xs text-stone-600 leading-relaxed">
            Di Railway, deployment berjalan otomatis via <code className="bg-stone-100 px-1 py-0.5 rounded text-stone-800">railway.toml</code> menggunakan container Node.js / Nixpacks.
          </p>
        </div>
      </div>

      {/* Code Browser */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-xs overflow-hidden">
        {/* File tabs */}
        <div className="flex items-center justify-between px-4 py-3 bg-stone-100 border-b border-stone-200 overflow-x-auto gap-2">
          <div className="flex items-center space-x-1">
            {files.map((file) => (
              <button
                key={file.filename}
                onClick={() => setSelectedFile(file.filename)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedFile === file.filename
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <FileCode className="w-3.5 h-3.5 text-stone-400" />
                <span>{file.filename}</span>
              </button>
            ))}
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-stone-200 text-stone-700 hover:text-stone-900 text-xs font-medium transition-colors shrink-0 shadow-xs"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-600">Disalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-stone-500" />
                <span>Salin Kode</span>
              </>
            )}
          </button>
        </div>

        {/* File info bar */}
        {active && (
          <div className="px-5 py-2.5 bg-stone-50 border-b border-stone-200 flex items-center justify-between text-xs text-stone-500">
            <span>
              <strong>File:</strong> {active.filename} &mdash; {active.title}
            </span>
            <span>{active.content ? `${active.content.split('\n').length} baris` : 'Kosong'}</span>
          </div>
        )}

        {/* Code View Area */}
        <div className="p-4 bg-stone-900 text-stone-100 overflow-x-auto font-mono text-xs max-h-[500px] leading-relaxed">
          <pre>
            <code>{active?.content || '# Tidak ada konten file'}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
