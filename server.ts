import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import {
  verifyTelegramToken,
  startTelegramPoller,
  getBotStatus,
  stopTelegramPoller
} from "./src/server/telegramPoller";
import {
  initTursoDatabase,
  getTursoConfig,
  getTursoClient,
  fetchAllVocabFromTurso,
  insertVocabToTurso,
  deleteVocabFromTurso,
  fetchAllRulesFromTurso,
  insertRuleToTurso
} from "./src/server/tursoClient";
import { COMPREHENSIVE_MAANYAN_VOCAB } from "./src/data/comprehensiveVocab";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Inisialisasi Google GenAI client (Server-Side)
const apiKey = process.env.GEMINI_API_KEY || "";
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Helper generator dengan model cascade handal & stabil (gemini-3.5-flash -> gemini-3.1-flash-lite -> gemini-3-flash-preview -> gemini-flash-latest)
async function generateGeminiContent(contents: any, config: any) {
  const ai = getAiClient();
  const modelsToTry = [
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-flash-latest"
  ];

  const finalConfig = {
    maxOutputTokens: 600,
    ...config
  };

  let lastError: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const model of modelsToTry) {
      try {
        return await ai.models.generateContent({
          model,
          contents,
          config: finalConfig
        });
      } catch (err: any) {
        lastError = err;
        const status = err?.status || err?.statusCode;
        console.warn(`[Gemini API] Model ${model} percobaan #${attempt + 1} gagal (${status || err?.message}). Mencoba alternatif...`);
        if (status === 503 || status === 429) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }
    }
    if (attempt === 0) {
      await new Promise(r => setTimeout(r, 2500));
    }
  }
  throw lastError || new Error("Semua model Gemini sedang tidak dapat dihubungi.");
}

// In-Memory Response Cache untuk menghindari request berulang (TTL 15 menit)
const responseCache = new Map<string, { reply: string; timestamp: number }>();

// Tier-1: Local Instant Dictionary & Greeting Matcher (0 Token Digunakan, <1ms)
function tryLocalDictionaryMatch(text: string): string | null {
  const clean = text.trim().toLowerCase().replace(/[?!.,]/g, "").replace(/\s+/g, " ");

  // 1. Salam & Percakapan Standar
  if (clean === "selamat pagi" || clean === "pagi" || clean === "kaiyat") {
    return "Kaiyat! (Selamat pagi!) Tabe salamat, inun kabar nu ta'ati? (Bagaimana kabarmu sekarang?)";
  }
  if (clean === "selamat siang" || clean === "selamat sore" || clean === "siang" || clean === "sore" || clean === "kamerer") {
    return "Kamerer! (Selamat siang/sore!) Tabe salamat, inun luan nu dangan aku? (Ada urusan apa denganku?)";
  }
  if (clean === "selamat malam" || clean === "malam" || clean === "kalamarian") {
    return "Kalamarian! (Selamat malam!) Tabe salamat, haut kuman kalamarian kah? (Sudah makan malamkah?)";
  }
  if (clean === "apa kabar" || clean === "inun kabar" || clean === "inun habar" || clean === "kabar") {
    return "Kabar ma'at! (Kabar baik!). Aku yiti asisten AI bahasa Dayak Ma'anyan. Hanyu dainun kabar nu? (Kamu bagaimana kabarmu?)";
  }
  if (clean === "terima kasih" || clean === "makasih" || clean === "tarima kasih") {
    return "Tarima kasih ganta! (Terima kasih kembali / Sama-sama!). Sanang gina'u nulung hanyu. (Senang rasanya membantu kamu.)";
  }
  if (clean === "siapa namamu" || clean === "hie ngaran nu" || clean === "siapa nama kamu") {
    return "Ngaran ku asisten AI Dayak Ma'anyan. Aku nulung hanyu bapaner nelang balajar basa ite. (Namaku asisten AI Dayak Ma'anyan. Aku membantumu berbicara dan belajar bahasa kita.)";
  }

  // 2. Pola Pertanyaan Kamus Kata Tunggal:
  // "apa arti <kata>", "arti <kata>", "apa artinya <kata>", "bahasa maanyannya <kata> apa?"
  let targetWord = "";
  let direction: "maanyan_to_indo" | "indo_to_maanyan" | "both" = "both";

  const matchArti = clean.match(/^(?:apa\s+)?(?:artinya|arti|artian|makna(?:nya)?)\s+(?:dari\s+|kata\s+)?([a-zA-Z0-9'`\-~]+)$/i);
  const matchKataArti = clean.match(/^([a-zA-Z0-9'`\-~]+)\s+(?:artinya|artian|maknanya)\s*(?:apa|inun)?$/i);
  const matchBasaMaanyan = clean.match(/^(?:apa\s+)?(?:bahasa\s+maanyan|bahasa\s+ma'anyan|basa\s+maanyan|bahasa\s+dayak)(?:nya|\s+dari)?\s+([a-zA-Z0-9'`\-~]+)(?:\s+apa)?$/i);
  const matchBasaIndo = clean.match(/^(?:apa\s+)?(?:bahasa\s+indonesia|bahasa\s+indo)(?:nya|\s+dari)?\s+([a-zA-Z0-9'`\-~]+)(?:\s+apa)?$/i);

  if (matchArti && matchArti[1]) {
    targetWord = matchArti[1].trim();
    direction = "both";
  } else if (matchKataArti && matchKataArti[1]) {
    targetWord = matchKataArti[1].trim();
    direction = "both";
  } else if (matchBasaMaanyan && matchBasaMaanyan[1]) {
    targetWord = matchBasaMaanyan[1].trim();
    direction = "indo_to_maanyan";
  } else if (matchBasaIndo && matchBasaIndo[1]) {
    targetWord = matchBasaIndo[1].trim();
    direction = "maanyan_to_indo";
  }

  if (targetWord && targetWord.length >= 2) {
    const wordLower = targetWord.toLowerCase();
    const allLearned = learnedVocabList.map(v => ({ term: v.term_maanyan, meaning: v.meaning_indonesian, category: v.category, notes: v.example_sentence || "" }));
    const fullDict = [...allLearned, ...CORE_VOCABULARY];

    if (direction === "maanyan_to_indo" || direction === "both") {
      const found = fullDict.find(v => {
        const t = v.term.toLowerCase();
        return t === wordLower || t.split("/").map(s => s.trim()).includes(wordLower);
      });
      if (found) {
        let res = `*${found.term}* hang bahasa Indonesia artinya **${found.meaning}**.\n\n📖 **Kategori:** ${found.category || "Kosakata Umum"}`;
        if (found.notes) res += `\n📝 **Contoh/Catatan:** ${found.notes}`;
        return res;
      }
    }

    if (direction === "indo_to_maanyan" || direction === "both") {
      const found = fullDict.find(v => {
        const m = v.meaning.toLowerCase();
        return m === wordLower || m.split("/").map(s => s.trim()).includes(wordLower);
      });
      if (found) {
        let res = `Bahasa Dayak Ma'anyan untuk **${found.meaning}** adalah **${found.term}**.\n\n📖 **Kategori:** ${found.category || "Kosakata Umum"}`;
        if (found.notes) res += `\n📝 **Contoh/Catatan:** ${found.notes}`;
        return res;
      }
    }
  }

  return null;
}

// In-Memory Database untuk Web Simulator (Sinkron dengan Turso / SQLite logic di Python)
interface LearnedVocabItem {
  id: string;
  term_maanyan: string;
  meaning_indonesian: string;
  category: string;
  example_sentence?: string;
  contributor: string;
  created_at: string;
}

interface LearnedRuleItem {
  id: string;
  title: string;
  rule_description: string;
  example?: string;
  created_at: string;
}

// Data awal memori yang dipelajari (contoh awal)
let learnedVocabList: LearnedVocabItem[] = [
  {
    id: "1",
    term_maanyan: "wusah",
    meaning_indonesian: "hujan",
    category: "Alam & Cuaca",
    example_sentence: "wusah tatu'u ta'ati (hujan sangat lebat sekarang)",
    contributor: "Sistem Contoh",
    created_at: new Date().toISOString()
  }
];

let learnedRuleList: LearnedRuleItem[] = [];

// Core Knowledge Base
const CORE_VOCABULARY = [
  { term: "nguta / kuman", meaning: "makan", category: "Kosakata Dasar", notes: "kuman dan nguta sering digunakan bergantian untuk makan" },
  { term: "nahi", meaning: "nasi", category: "Kosakata Dasar", notes: "makanan pokok" },
  { term: "waday", meaning: "kue / kudapan", category: "Kosakata Dasar", notes: "kue tradisional atau cemilan" },
  { term: "ranu", meaning: "air", category: "Kosakata Dasar", notes: "air minum atau air umum" },
  { term: "hungei", meaning: "sungai", category: "Kosakata Dasar", notes: "aliran air atau sungai" },
  { term: "ume", meaning: "ladang", category: "Kosakata Dasar", notes: "ladang padi / perkebunan" },
  { term: "lewu", meaning: "rumah", category: "Kosakata Dasar", notes: "tempat tinggal" },
  { term: "tumpuk", meaning: "kampung / desa", category: "Kosakata Dasar", notes: "pemukiman warga" },
  { term: "yiti", meaning: "ini", category: "Tunjuk & Objek", notes: "kata tunjuk dekat" },
  { term: "yina", meaning: "itu", category: "Tunjuk & Objek", notes: "kata tunjuk jauh" },
  { term: "yiru / iru", meaning: "itu (merujuk objek tertentu)", category: "Tunjuk & Objek", notes: "kata tunjuk objek yang telah dibahas" },
  { term: "iya", meaning: "anak", category: "Tunjuk & Objek", notes: "anak kecil atau keturunan" },
  { term: "ulun", meaning: "orang", category: "Tunjuk & Objek", notes: "manusia atau seseorang" },
  { term: "bagawi", meaning: "bekerja", category: "Aktivitas & Waktu", notes: "melakukan pekerjaan" },
  { term: "naragu", meaning: "memperbaiki", category: "Aktivitas & Waktu", notes: "membenahi barang rusak" },
  { term: "mangang", meaning: "memanggang", category: "Aktivitas & Waktu", notes: "memanggang makanan di atas bara api" },
  { term: "mandre", meaning: "tidur", category: "Aktivitas & Waktu", notes: "istirahat tidur" },
  { term: "ta'ati", meaning: "sekarang / saat ini", category: "Aktivitas & Waktu", notes: "keterangan waktu sekarang" },
  { term: "iengen / kamalem", meaning: "malam / kemalaman", category: "Aktivitas & Waktu", notes: "waktu malam hari" },
  { term: "kariwe die", meaning: "nanti sore", category: "Aktivitas & Waktu", notes: "keterangan waktu sore hari nanti" },
  { term: "layah", meaning: "lapar (tingkat biasa)", category: "Tingkat Kelaparan", notes: "rasa lapar standar saat tiba waktu makan" },
  { term: "kalauan", meaning: "sangat lapar", category: "Tingkat Kelaparan", notes: "lapar berat karena terlambat makan" },
  { term: "hinut", meaning: "lapar banget mau pingsan / lemas", category: "Tingkat Kelaparan", notes: "tingkat lapar ekstrem hingga gemetar/lemas" },
  { term: "daya / dagana", meaning: "karena / sebab", category: "Kata Hubung & Partikel", notes: "konjungsi sebab akibat" },
  { term: "kude", meaning: "tapi / tetapi", category: "Kata Hubung & Partikel", notes: "konjungsi pertentangan" },
  { term: "dadijari", meaning: "jadi / makanya / oleh karena itu", category: "Kata Hubung & Partikel", notes: "konjungsi kesimpulan" },
  { term: "ekat", meaning: "cuma / hanya", category: "Kata Hubung & Partikel", notes: "pembatasan" },
  { term: "tatu'u", meaning: "sangat / banget / sungguh", category: "Kata Hubung & Partikel", notes: "penegas intensitas (misal: layah tatu'u)" },
  { term: "nelang", meaning: "sambil / seraya", category: "Kata Hubung & Partikel", notes: "melakukan dua hal simultan" },
  { term: "baya", meaning: "dan / serta", category: "Kata Hubung & Partikel", notes: "penghubung penambahan" },
  { term: "sindrah", meaning: "bersama / dengan", category: "Kata Hubung & Partikel", notes: "kebersamaan" },
  { term: "hayu", meaning: "mari / ayo", category: "Kata Hubung & Partikel", notes: "ajakan" },
  { term: "puang ka'itung", meaning: "lupa / tidak teringat", category: "Ungkapan Khas", notes: "lupa ingatan akan sesuatu" },
  { term: "bapaner", meaning: "bicara / mengajar / bercakap", category: "Aktivitas & Waktu", notes: "berbicara dalam bahasa Ma'anyan" },
  { term: "luput", meaning: "selesai / usai", category: "Kata Kerja / Kondisi", notes: "pekerjaan atau kondisi telah usai" },
  { term: "Hie ngaran nu?", meaning: "Siapa namamu?", category: "Frasa Tanya", notes: "pertanyaan standar menanyakan nama" },
  { term: "aku", meaning: "aku / saya", category: "Kata Ganti", notes: "orang pertama tunggal" },
  { term: "hanyu", meaning: "kamu / engkau", category: "Kata Ganti", notes: "orang kedua tunggal" },
  { term: "hanye", meaning: "dia / ia", category: "Kata Ganti", notes: "orang ketiga tunggal" },
  { term: "kami / ite", meaning: "kami / kita", category: "Kata Ganti", notes: "orang pertama jamak" },
  { term: "ere / kere", meaning: "mereka", category: "Kata Ganti", notes: "orang ketiga jamak" },
  ...COMPREHENSIVE_MAANYAN_VOCAB.map(v => ({
    term: v.term,
    meaning: v.meaning,
    category: v.category || "Kosakata Pengguna",
    notes: v.example || `Artinya: ${v.meaning}`
  }))
];

// Fungsi pintar penyaring kosakata relevan (Smart Context RAG) agar ukuran prompt ringkas dan tidak memicu 503/timeout
function getRelevantVocab(userText: string = "", limit: number = 80): { term: string; meaning: string; category: string; notes: string }[] {
  const words = userText.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
  
  if (words.length === 0) {
    return CORE_VOCABULARY.slice(0, limit);
  }

  const scored = CORE_VOCABULARY.map(item => {
    let score = 0;
    const termLower = item.term.toLowerCase();
    const meaningLower = item.meaning.toLowerCase();
    
    for (const w of words) {
      if (termLower.includes(w)) score += 3;
      if (meaningLower.includes(w)) score += 2;
    }
    return { item, score };
  });

  // Urutkan yang paling relevan dulu, lalu lengkapi dengan kosakata dasar
  const relevant = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.item);

  const fallback = CORE_VOCABULARY.slice(0, 40);
  const combined = [...relevant, ...fallback];
  const unique = Array.from(new Map(combined.map(v => [v.term, v])).values());
  return unique.slice(0, limit);
}

function buildSystemInstruction(mode: "chat" | "latihan", contextText: string = ""): string {
  const relevantVocab = getRelevantVocab(contextText, 70);
  const coreVocabStr = relevantVocab.map(v => `- ${v.term} = ${v.meaning} (${v.category})`).join("\n");
  
  const recentLearned = learnedVocabList.slice(0, 30);
  const learnedVocabStr = recentLearned.length > 0 
    ? recentLearned.map(v => `- ${v.term_maanyan} = ${v.meaning_indonesian} (${v.category})`).join("\n")
    : "(Belum ada kosakata tambahan yang dipelajari)";

  const recentRules = learnedRuleList.slice(0, 10);
  const learnedRulesStr = recentRules.length > 0
    ? recentRules.map(r => `- ${r.title}: ${r.rule_description}`).join("\n")
    : "(Gunakan tata bahasa Ma'anyan standar)";

  const modeInstruction = mode === "latihan"
    ? `[MODE LATIHAN & INTERACTIVE TESTING]
Tugas Utama:
1. Berperan sebagai Mentor Bahasa Dayak Ma'anyan yang ramah dan interaktif.
2. Buat latihan tebak kata, terjemahan dua arah, atau kuis skenario.
3. Evaluasi jawaban pengguna dengan ramah, berikan koreksi jika ada yang keliru, beri pujian jika benar (misal: "Kena tatu'u!"), dan beri soal berikutnya.`
    : `[MODE CHAT & ROLEPLAY PENUTUR ASLI]
Tugas Utama:
1. Berperan sebagai penutur asli Dayak Ma'anyan yang ramah dan luwes.
2. Jawablah dalam bahasa Dayak Ma'anyan yang alami.
3. Di bawah atau di samping kalimat bahasa Dayak Ma'anyan, sertakan terjemahan bahasa Indonesia dalam kurung/tanda kutip agar pengguna mengerti.
4. Gunakan partikel khas seperti: hang (di), ma (ke), tatu'u (sangat/banget), daya/dagana (karena), kude (tetapi), nelang (sambil), ta'ati (sekarang), haut (sudah), puang/ang (tidak).`;

  return `Anda adalah Model Bahasa & Asisten AI Cerdas Bahasa Dayak Ma'anyan (Kalimantan Tengah / Barito Timur).

${modeInstruction}

=== PANDUAN KOSAKATA PILIHAN ===
${coreVocabStr}

=== KOSAKATA TERBARU DARI PENGGUNA ===
${learnedVocabStr}

[Aturan Tata Bahasa]:
${learnedRulesStr}

=== PEDOMAN KONTINUITAS PERCAKAPAN (SANGAT PENTING) ===
- Sambungkan konteks percakapan sebelumnya secara alami dan koheren.
- JANGAN MENGULANG perkenalan diri (seperti "Kaiyat!", "Ngaran ku asisten AI...", "Tabe salamat...") atau menanyakan nama kembali jika sedang berada dalam percakapan lanjutan (follow-up).
- Jika pengguna bertanya kelanjutan cerita atau menanyakan hal terkait respon sebelumnya (misal: "lalu?", "ceritakan lagi", "siapa dia?", "artinya apa?"), langsung jawab intinya sesuai alur obrolan.
- Jika diminta bercerita atau dongeng (misal: Cinderella, Palanuk), lanjutkan jalan ceritanya dengan runtut.`.trim();
}

// API Routes
app.get("/api/vocab", (req, res) => {
  res.json({
    core: CORE_VOCABULARY,
    learned: learnedVocabList,
    rules: learnedRuleList
  });
});

app.post("/api/learn", async (req, res) => {
  const { term, meaning, category, example } = req.body;
  if (!term || !meaning) {
    return res.status(400).json({ error: "Term dan meaning wajib diisi" });
  }

  const cleanTerm = term.trim().toLowerCase();
  const cleanMeaning = meaning.trim().toLowerCase();
  const cleanCategory = category || "Umum";
  const cleanExample = example || "";

  const existingIndex = learnedVocabList.findIndex(v => v.term_maanyan.toLowerCase() === cleanTerm);
  const newItem: LearnedVocabItem = {
    id: String(Date.now()),
    term_maanyan: cleanTerm,
    meaning_indonesian: cleanMeaning,
    category: cleanCategory,
    example_sentence: cleanExample,
    contributor: "Simulator User",
    created_at: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    learnedVocabList[existingIndex] = newItem;
  } else {
    learnedVocabList.unshift(newItem);
  }

  // Simpan ke Turso Database jika terhubung
  await insertVocabToTurso(cleanTerm, cleanMeaning, cleanCategory, cleanExample, "Simulator User");

  res.json({ success: true, item: newItem, totalLearned: learnedVocabList.length });
});

app.post("/api/reset-learned", (req, res) => {
  learnedVocabList = [];
  learnedRuleList = [];
  res.json({ success: true, message: "Memori simulasi berhasil direset" });
});

// Endpoint Status & Inisialisasi Manual Turso Database
app.get("/api/turso-status", (req, res) => {
  const config = getTursoConfig();
  res.json({
    configured: config.isConfigured,
    url: config.url ? `${config.url.slice(0, 18)}...` : null,
    totalVocab: learnedVocabList.length,
    totalRules: learnedRuleList.length
  });
});

app.post("/api/turso-init", async (req, res) => {
  const result = await initTursoDatabase();
  if (result.success) {
    const dbVocabs = await fetchAllVocabFromTurso();
    if (dbVocabs.length > 0) learnedVocabList = dbVocabs;
    const dbRules = await fetchAllRulesFromTurso();
    if (dbRules.length > 0) learnedRuleList = dbRules;
  }
  res.json(result);
});

// API Chat dengan Gemini (Resilient Fallback) + Tier-1 Local Match + Auto-Learning Detection
app.post("/api/chat", async (req, res) => {
  try {
    const { message, mode = "chat", history = [] } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Pesan tidak boleh kosong" });
    }

    let detectedLearning: any = null;

    // 1. Deteksi cepat auto-learning berbasis pola regex (hemat kuota & tanpa delay LLM)
    const lines = message.split("\n").map((l: string) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const cleanLine = line.replace(/^(?:kata baru|koreksi|tambahkan kosakata|catat kata)\s*[:=-]?\s*/i, "").trim();
      const match = cleanLine.match(/^([a-zA-Z0-9'`\-~\s]{2,30})\s+(?:artinya|=|maknanya|yaitu|seharusnya)\s+([a-zA-Z0-9'`\-~,\s]{2,80})$/i);
      if (match && match[1] && match[2]) {
        const term = match[1].trim().toLowerCase();
        const meaning = match[2].trim().toLowerCase();
        
        if (!term.startsWith("apa") && !term.startsWith("kenapa") && !term.startsWith("inun") && !term.includes("?")) {
          detectedLearning = {
            term: term,
            meaning: meaning,
            category: "Kosakata Baru",
            example: `${term} = ${meaning}`
          };

          const existingIdx = learnedVocabList.findIndex(v => v.term_maanyan.toLowerCase() === term);
          const newItem: LearnedVocabItem = {
            id: String(Date.now()),
            term_maanyan: term,
            meaning_indonesian: meaning,
            category: "Kosakata Baru",
            example_sentence: `${term} = ${meaning}`,
            contributor: "Chat User",
            created_at: new Date().toISOString()
          };

          if (existingIdx >= 0) {
            learnedVocabList[existingIdx] = newItem;
          } else {
            learnedVocabList.unshift(newItem);
          }

          insertVocabToTurso(term, meaning, "Kosakata Baru", `${term} = ${meaning}`, "Chat User").catch(() => {});
          break;
        }
      }
    }

    // 2. OPTIMASI TIER-1: Coba pencocokan kamus lokal & salam langsung (Hanya jika awal percakapan atau pertanyaan kamus eksplisit)
    const isExplicitDictionaryQuery = /^(?:apa\s+)?(?:artinya|arti|artian|makna|bahasa\s+maanyan|basa\s+maanyan)\s+/i.test(message.trim());
    const isInitialGreeting = Array.isArray(history) && history.length === 0;

    if (mode === "chat" && !detectedLearning && (isInitialGreeting || isExplicitDictionaryQuery)) {
      const localMatch = tryLocalDictionaryMatch(message);
      if (localMatch) {
        return res.json({
          reply: localMatch,
          detectedLearning: null,
          totalLearned: learnedVocabList.length,
          optimizedVia: "local_cache"
        });
      }
    }

    // 3. OPTIMASI TIER-2: Cek Response Cache untuk pertanyaan pembuka yang identik (Hanya untuk pesan awal tanpa riwayat)
    const cacheKey = `${mode}:${message.trim().toLowerCase()}`;
    const cached = responseCache.get(cacheKey);
    const now = Date.now();
    if (isInitialGreeting && cached && now - cached.timestamp < 15 * 60 * 1000 && !detectedLearning) {
      return res.json({
        reply: cached.reply,
        detectedLearning: null,
        totalLearned: learnedVocabList.length,
        optimizedVia: "response_cache"
      });
    }

    // 4. Generate balasan dengan dynamic system instruction
    const systemInstruction = buildSystemInstruction(mode as "chat" | "latihan", message);

    // Format & compact history (simpan riwayat percakapan hingga 6 giliran agar obrolan nyambung)
    const contents: any[] = [];
    if (Array.isArray(history)) {
      for (const item of history.slice(-6)) {
        let text = (item.text || "").trim();
        if (item.role !== "user" && text.length > 800) {
          text = text.substring(0, 800) + "...";
        }
        contents.push({
          role: item.role === "user" ? "user" : "model",
          parts: [{ text }]
        });
      }
    }
    contents.push({
      role: "user",
      parts: [{ text: message }]
    });

    const isStory = /cerita|dongeng|cinderella|palanuk/i.test(message);
    const response = await generateGeminiContent(contents, {
      systemInstruction: systemInstruction,
      temperature: mode === "chat" ? 0.7 : 0.4,
      maxOutputTokens: isStory ? 800 : (mode === "chat" ? 500 : 350)
    });

    const replyText = response.text || "Puang ka'itung... Maaf terjadi kendala jaringan.";

    // Simpan ke response cache
    if (replyText && !replyText.startsWith("⚠️")) {
      responseCache.set(cacheKey, { reply: replyText, timestamp: Date.now() });
      // Batasi ukuran cache maksimal 100 entri
      if (responseCache.size > 100) {
        const firstKey = responseCache.keys().next().value;
        if (firstKey) responseCache.delete(firstKey);
      }
    }

    res.json({
      reply: replyText,
      detectedLearning: detectedLearning,
      totalLearned: learnedVocabList.length
    });

  } catch (error: any) {
    console.error("Chat API Error:", error);
    const status = error?.status || error?.statusCode;
    if (status === 429) {
      return res.status(200).json({
        reply: "⚠️ *Batas kuota Gemini API gratis saat ini sedang jeda sejenak (rate limit).* Mohon tunggu sekitar 20-30 detik lalu kirim ulang pesan kamu ya!",
        detectedLearning: null,
        totalLearned: learnedVocabList.length
      });
    }
    if (status === 503) {
      return res.status(200).json({
        reply: "⚠️ *Server Google Gemini sedang mengalami lonjakan antrean (high demand).* Mohon coba kirim ulang dalam beberapa detik.",
        detectedLearning: null,
        totalLearned: learnedVocabList.length
      });
    }
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// API untuk membaca kode file Python bot agar bisa dilihat & dicopy di frontend
app.get("/api/python-files", (req, res) => {
  const dirPath = path.join(process.cwd(), "telegram_bot");
  try {
    const files = [
      { name: "bot.py", title: "Aplikasi Telegram Bot Utama" },
      { name: "gemini_brain.py", title: "Mesin AI Gemini & Auto-Learning" },
      { name: "knowledge_base.py", title: "Core Knowledge Base & Dialek" },
      { name: "database.py", title: "Manajemen Database SQLite3" },
      { name: "requirements.txt", title: "Daftar Dependencies Python" },
      { name: ".env.example", title: "Template Konfigurasi Token" },
      { name: "README.md", title: "Panduan Lengkap Setup & Deploy" }
    ];

    const result = files.map(f => {
      const filePath = path.join(dirPath, f.name);
      let content = "";
      if (fs.existsSync(filePath)) {
        content = fs.readFileSync(filePath, "utf-8");
      }
      return {
        filename: f.name,
        title: f.title,
        content: content
      };
    });

    res.json({ files: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API Status Telegram Bot
app.get("/api/telegram-status", (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const status = getBotStatus();
  res.json({
    tokenConfigured: Boolean(token),
    status: status
  });
});

function launchTelegramPoller(tgToken: string) {
  startTelegramPoller(
    tgToken,
    getAiClient(),
    buildSystemInstruction,
    async (term, meaning, category, example) => {
      console.log(`[Telegram Auto-Learn] Menambahkan kata baru: ${term} = ${meaning}`);
      const cleanTerm = term.toLowerCase().trim();
      const cleanMeaning = meaning.toLowerCase().trim();
      const cleanCategory = category || "Kosakata Baru (Telegram)";
      const cleanExample = example || "";
      const existingIdx = learnedVocabList.findIndex(v => v.term_maanyan.toLowerCase() === cleanTerm);
      const newItem: LearnedVocabItem = {
        id: String(Date.now()),
        term_maanyan: cleanTerm,
        meaning_indonesian: cleanMeaning,
        category: cleanCategory,
        example_sentence: cleanExample,
        contributor: "Pengguna Telegram Live",
        created_at: new Date().toISOString()
      };
      if (existingIdx >= 0) {
        learnedVocabList[existingIdx] = newItem;
      } else {
        learnedVocabList.unshift(newItem);
      }
      await insertVocabToTurso(
        cleanTerm,
        cleanMeaning,
        cleanCategory,
        cleanExample,
        "Pengguna Telegram Live"
      );
    },
    tryLocalDictionaryMatch
  );
}

// Endpoint untuk Manual Start / Stop Poller dari Web Dashboard
app.post("/api/telegram-poller/start", async (req, res) => {
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!tgToken) {
    return res.status(400).json({ success: false, error: "TELEGRAM_BOT_TOKEN belum diset di environment." });
  }

  const verify = await verifyTelegramToken(tgToken);
  if (!verify.success) {
    return res.status(400).json({ success: false, error: verify.error });
  }

  launchTelegramPoller(tgToken);

  res.json({ success: true, message: `Poller Telegram @${verify.bot.username} berhasil diaktifkan!`, status: getBotStatus() });
});

app.post("/api/telegram-poller/stop", (req, res) => {
  stopTelegramPoller();
  res.json({ success: true, message: "Poller Telegram berhasil dihentikan.", status: getBotStatus() });
});

async function startServer() {
  // 1. Inisialisasi Turso Cloud Database jika konfigurasi tersedia
  const tursoConfig = getTursoConfig();
  if (tursoConfig.isConfigured) {
    console.log("[Turso] Terdeteksi konfigurasi Turso URL & Auth Token. Menginisialisasi tabel database...");
    try {
      const initResult = await initTursoDatabase();
      console.log(`[Turso] ${initResult.message}`);

      // Muat kosakata dan aturan yang tersimpan di Turso
      const dbVocabs = await fetchAllVocabFromTurso();
      if (dbVocabs.length > 0) {
        learnedVocabList = dbVocabs;
        console.log(`[Turso] Berhasil memuat ${dbVocabs.length} kosakata dari Turso Database.`);
      }

      const dbRules = await fetchAllRulesFromTurso();
      if (dbRules.length > 0) {
        learnedRuleList = dbRules;
        console.log(`[Turso] Berhasil memuat ${dbRules.length} aturan tata bahasa dari Turso Database.`);
      }
    } catch (tursoErr) {
      console.error("[Turso] Gagal menghubungkan ke Turso saat startup:", tursoErr);
    }
  } else {
    console.log("[Turso] Konfigurasi TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN belum terdeteksi. Menggunakan in-memory storage.");
  }

  // 2. Inisialisasi status Telegram Bot
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  
  // Deteksi Railway / Production Deployment
  const isRailway = Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_STATIC_URL
  );
  const isProduction = process.env.NODE_ENV === "production";
  const isExplicitlyDisabled = process.env.DISABLE_TELEGRAM_POLLER === "true";
  const isExplicitlyEnabled = process.env.ENABLE_TELEGRAM_POLLER === "true";
  
  // Cek apakah sedang di sandbox AI Studio dev preview
  const isAiStudioDevPreview = Boolean(
    process.env.K_SERVICE && process.env.K_SERVICE.includes("ais-dev") && !isRailway
  );
  
  // Di Railway, Production, atau server mandiri: Poller selalu otomatis aktif
  const shouldAutoStartPoller = !isExplicitlyDisabled && (
    isRailway ||
    isProduction ||
    isExplicitlyEnabled ||
    !isAiStudioDevPreview
  );

  if (tgToken) {
    console.log("[Telegram] Memverifikasi token Telegram Bot...");
    verifyTelegramToken(tgToken).then(res => {
      if (res.success) {
        console.log(`[Telegram] Bot Terhubung sebagai @${res.bot.username} (${res.bot.first_name})`);
        if (shouldAutoStartPoller) {
          console.log(`[Telegram] Menjalankan Telegram Long Poller (Platform: ${isRailway ? 'Railway' : isProduction ? 'Production' : 'Standalone Server'})...`);
          launchTelegramPoller(tgToken);
        } else {
          console.log("[Telegram] AI Studio dev preview terdeteksi. Poller default standby agar tidak bentrok dengan instance Railway. Anda bisa menyalakan poller kapan saja dari tombol di Web UI Dashboard atau set ENABLE_TELEGRAM_POLLER=true.");
        }
      } else {
        console.error("[Telegram] Gagal verifikasi token:", res.error);
      }
    });
  } else {
    console.log("[Telegram] Token belum dikonfigurasi di TELEGRAM_BOT_TOKEN.");
  }
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
