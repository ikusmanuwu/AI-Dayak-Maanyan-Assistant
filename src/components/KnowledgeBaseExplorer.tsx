import React, { useState } from 'react';
import { Search, BookOpen, Layers, Info } from 'lucide-react';
import { VocabItem } from '../types';

interface KnowledgeBaseExplorerProps {
  vocabulary: VocabItem[];
}

export const KnowledgeBaseExplorer: React.FC<KnowledgeBaseExplorerProps> = ({ vocabulary }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');

  const categories = ['Semua', ...Array.from(new Set(vocabulary.map((v) => v.category)))];

  const filteredVocab = vocabulary.filter((item) => {
    const matchesCategory = selectedCategory === 'Semua' || item.category === selectedCategory;
    const matchesSearch =
      item.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.meaning.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.notes && item.notes.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Intro Banner */}
      <div className="bg-amber-900 text-white rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-xs">
        <div className="relative z-10 max-w-2xl">
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-800 text-amber-200 uppercase tracking-wide">
            Kamus & Dialek Barito Timur
          </span>
          <h2 className="text-2xl font-bold mt-2 mb-2 tracking-tight">
            Core Knowledge Base Bahasa Dayak Ma'anyan
          </h2>
          <p className="text-sm text-amber-100/90 leading-relaxed">
            Kumpulan kosakata dasar, partikel kalimat, dan tingkatan rasa khas Dayak Ma'anyan yang disematkan langsung ke dalam System Instruction Gemini.
          </p>
        </div>
      </div>

      {/* Special Linguistic Nuance Card: Tingkatan Lapar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-xs">
          <div className="flex items-center space-x-2 text-amber-700 font-semibold text-sm mb-1">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <h4>Layah</h4>
          </div>
          <p className="text-xs font-medium text-stone-700 mb-1">Lapar Tingkat Standar</p>
          <p className="text-xs text-stone-500">
            Kondisi lapar normal saat tiba jam makan siang atau sore hari.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-xs">
          <div className="flex items-center space-x-2 text-orange-700 font-semibold text-sm mb-1">
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
            <h4>Kalau'an</h4>
          </div>
          <p className="text-xs font-medium text-stone-700 mb-1">Sangat Lapar</p>
          <p className="text-xs text-stone-500">
            Kondisi lapar berat akibat terlambat makan cukup lama atau setelah bekerja di ladang (ume).
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-xs">
          <div className="flex items-center space-x-2 text-rose-700 font-semibold text-sm mb-1">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <h4>Hinut</h4>
          </div>
          <p className="text-xs font-medium text-stone-700 mb-1">Lapar Ekstrem / Mau Pingsan</p>
          <p className="text-xs text-stone-500">
            Tingkatan lapar paling ekstrem sampai tubuh gemetar, lemas, dan nyaris kehilangan tenaga.
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari kosakata Ma'anyan atau Indonesia..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 text-stone-900 placeholder-stone-400"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-amber-700 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Vocabulary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredVocab.map((item, idx) => (
          <div
            key={idx}
            className="p-4 bg-white border border-stone-200 rounded-xl shadow-xs hover:border-amber-400 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md">
                  {item.category}
                </span>
              </div>
              <h3 className="text-base font-bold text-stone-900 tracking-tight">
                {item.term}
              </h3>
              <p className="text-sm text-stone-700 font-medium mt-0.5">
                {item.meaning}
              </p>
            </div>

            {item.notes && (
              <p className="text-xs text-stone-500 mt-3 pt-2 border-t border-stone-100 italic">
                {item.notes}
              </p>
            )}
          </div>
        ))}
      </div>

      {filteredVocab.length === 0 && (
        <div className="p-12 text-center bg-white rounded-xl border border-stone-200">
          <BookOpen className="w-8 h-8 text-stone-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-stone-600">Tidak ada kosakata yang cocok.</p>
          <p className="text-xs text-stone-400 mt-1">Coba gunakan kata kunci pencarian yang lain.</p>
        </div>
      )}
    </div>
  );
};
