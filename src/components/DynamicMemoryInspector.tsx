import React, { useState } from 'react';
import { Database, Plus, Trash2, CheckCircle2, User, Clock, Sparkles } from 'lucide-react';
import { LearnedVocab } from '../types';

interface DynamicMemoryInspectorProps {
  learnedVocab: LearnedVocab[];
  onAddVocab: (term: string, meaning: string, category: string, example?: string) => Promise<void>;
  onResetMemory: () => Promise<void>;
  isLoading: boolean;
}

export const DynamicMemoryInspector: React.FC<DynamicMemoryInspectorProps> = ({
  learnedVocab,
  onAddVocab,
  onResetMemory,
  isLoading
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [term, setTerm] = useState('');
  const [meaning, setMeaning] = useState('');
  const [category, setCategory] = useState('Kosakata Tambahan');
  const [example, setExample] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim() || !meaning.trim()) return;
    await onAddVocab(term.trim(), meaning.trim(), category, example.trim());
    setTerm('');
    setMeaning('');
    setExample('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-stone-900">
              Dynamic Auto-Learning Memory
            </h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              {learnedVocab.length} Kosakata Dipelajari
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1 max-w-xl">
            Setiap kali pengguna mengoreksi atau mengajarkan kata baru di chat Simulator atau Telegram, AI mengekstrak dan menyimpannya secara otomatis ke memori ini untuk memperkaya System Instruction.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Manual</span>
          </button>

          {learnedVocab.length > 0 && (
            <button
              onClick={onResetMemory}
              disabled={isLoading}
              className="px-3.5 py-2 bg-stone-100 hover:bg-rose-50 hover:text-rose-700 text-stone-600 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 border border-stone-200"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Manual Add Modal / Form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="p-5 bg-white border border-emerald-300 rounded-2xl shadow-xs space-y-4 animate-fadeIn">
          <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>Ajarkan Kosakata Baru ke Memori AI</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Kata / Frasa Ma'anyan:
              </label>
              <input
                type="text"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Contoh: wusah"
                required
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Arti Bahasa Indonesia:
              </label>
              <input
                type="text"
                value={meaning}
                onChange={(e) => setMeaning(e.target.value)}
                placeholder="Contoh: hujan"
                required
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Kategori:
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Contoh: Cuaca & Alam"
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Contoh Kalimat (Opsional):
              </label>
              <input
                type="text"
                value={example}
                onChange={(e) => setExample(e.target.value)}
                placeholder="Contoh: wusah tatu'u ta'ati"
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-800"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Simpan ke Memori
            </button>
          </div>
        </form>
      )}

      {/* List of learned items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {learnedVocab.map((item) => (
          <div
            key={item.id}
            className="p-4 bg-white border border-stone-200 rounded-xl shadow-xs hover:border-emerald-300 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">
                  {item.category || 'Kosakata Baru'}
                </span>
                <span className="inline-flex items-center text-[10px] text-stone-400 gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(item.created_at).toLocaleDateString('id-ID')}
                </span>
              </div>

              <h3 className="text-base font-bold text-stone-900">
                {item.term_maanyan}
              </h3>
              <p className="text-xs text-stone-700 font-medium mt-0.5">
                Arti: {item.meaning_indonesian}
              </p>

              {item.example_sentence && (
                <p className="text-xs text-stone-500 mt-2 bg-stone-50 p-2 rounded-lg italic">
                  "{item.example_sentence}"
                </p>
              )}
            </div>

            <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" /> {item.contributor}
              </span>
              <span className="text-emerald-600 font-medium flex items-center gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> Aktif
              </span>
            </div>
          </div>
        ))}
      </div>

      {learnedVocab.length === 0 && (
        <div className="p-12 text-center bg-white rounded-xl border border-stone-200">
          <Database className="w-8 h-8 text-stone-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-stone-600">Belum ada memori kosakata baru.</p>
          <p className="text-xs text-stone-400 mt-1">
            Ketik di simulator atau Telegram: <em>"kata baru: wusah artinya hujan lebat"</em> untuk menguji auto-learning.
          </p>
        </div>
      )}
    </div>
  );
};
