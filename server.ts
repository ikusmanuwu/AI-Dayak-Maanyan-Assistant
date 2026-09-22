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
const PORT = 3000;

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

// Helper generator dengan resilient model cascade (gemini-3.6-flash -> gemini-3.5-flash -> gemini-3-flash-preview)
async function generateGeminiContent(contents: any, config: any) {
  const ai = getAiClient();
  const modelsToTry = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
    "gemini-flash-latest"
  ];

  let lastError: any = null;
  for (const model of modelsToTry) {
    try {
      return await ai.models.generateContent({
        model,
        contents,
        config
      });
    } catch (err: any) {
      lastError = err;
      console.warn(`[Gemini API] Model ${model} gagal (${err?.status || err?.message}). Mencoba model berikutnya...`);
    }
  }
  throw lastError || new Error("Semua model Gemini sedang tidak dapat dihubungi.");
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

function buildSystemInstruction(mode: "chat" | "latihan"): string {
  const coreVocabStr = CORE_VOCABULARY.map(v => `- ${v.term} = ${v.meaning} (${v.category}) [${v.notes}]`).join("\n");
  const learnedVocabStr = learnedVocabList.length > 0 
    ? learnedVocabList.map(v => `- ${v.term_maanyan} = ${v.meaning_indonesian} (${v.category}) [Contoh: ${v.example_sentence || '-'}]`).join("\n")
    : "(Belum ada kosakata tambahan yang dipelajari)";

  const learnedRulesStr = learnedRuleList.length > 0
    ? learnedRuleList.map(r => `- ${r.title}: ${r.rule_description}`).join("\n")
    : "(Belum ada aturan tambahan)";

  const modeInstruction = mode === "latihan"
    ? `[MODE LATIHAN & INTERACTIVE TESTING]
Tugas Utama:
1. Berperan sebagai Mentor Bahasa Dayak Ma'anyan yang ramah dan interaktif.
2. Buat latihan tebak kata, terjemahan dua arah, atau kuis skenario.
3. Evaluasi jawaban pengguna dengan ramah, berikan koreksi jika ada yang keliru, beri pujian jika benar (misal: "Kena tatu'u!"), dan beri soal berikutnya.`
    : `[MODE CHAT & ROLEPLAY PENUTUR ASLI]
Tugas Utama:
1. Berperan sebagai penutur asli Dayak Ma'anyan yang ramah dan luwes.
2. Jawablah terutama dalam bahasa Dayak Ma'anyan yang alami.
3. Di bawah kalimat bahasa Dayak Ma'anyan, sertakan terjemahan bahasa Indonesia dalam kurung/tanda kutip agar pengguna bisa belajar.
4. Gunakan partikel khas seperti 'tatu'u' (banget), 'daya/dagana' (karena), 'kude' (tetapi), 'nelang' (sambil), 'ta'ati' (sekarang), dan bedakan tingkatan lapar (layah -> kalauan -> hinut).`;

  return `Anda adalah Model Bahasa & Asisten AI Cerdas Bahasa Dayak Ma'anyan (Kalimantan Tengah / Barito Timur).

${modeInstruction}

=== CORE KNOWLEDGE BASE (KOSAKATA & ATURAN AWAL) ===
${coreVocabStr}

=== DYNAMIC MEMORY (KOSAKATA BARU HASIL AUTO-LEARNING DATABASE) ===
${learnedVocabStr}

[Aturan Tambahan]:
${learnedRulesStr}

=== PRINSIP PENTING ===
- Responsif, lestarikan keaslian bahasa Dayak Ma'anyan.
- Jika pengguna mengoreksi atau mengajarkan kata baru, ucapkan terima kasih dan gunakan pengetahuan tersebut.`.trim();
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

// API Chat dengan Gemini (Resilient Fallback) + Auto-Learning Detection
app.post("/api/chat", async (req, res) => {
  try {
    const { message, mode = "chat", history = [] } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Pesan tidak boleh kosong" });
    }

    let detectedLearning: any = null;

    // 1. Deteksi apakah pesan ini mengandung pengajaran kosakata / koreksi
    const triggers = ["artinya", "artian", "harusnya", "salah", "koreksi", "beda", "maanyan", "kata", "bukan", "adalah"];
    const hasTrigger = triggers.some(t => message.toLowerCase().includes(t));

    if (hasTrigger || message.length > 20) {
      try {
        const detectionPrompt = `Analisis apakah pesan ini mengajarkan kosakata baru, mengoreksi terjemahan, atau aturan bahasa Dayak Ma'anyan:
"${message}"

Kembalikan HANYA format JSON:
{
  "is_teaching": true / false,
  "term": "kata ma'anyan atau kosongkan",
  "meaning": "arti indonesia atau kosongkan",
  "category": "kategori kata",
  "example": "contoh kalimat",
  "rule": "penjelasan aturan jika ada"
}`;

        const detectionResp = await generateGeminiContent(detectionPrompt, {
          responseMimeType: "application/json",
          temperature: 0.1
        });

        const parsed = JSON.parse(detectionResp.text?.trim() || "{}");
        if (parsed.is_teaching && parsed.term && parsed.meaning) {
          detectedLearning = {
            term: parsed.term.toLowerCase().trim(),
            meaning: parsed.meaning.toLowerCase().trim(),
            category: parsed.category || "Kosakata Baru",
            example: parsed.example || ""
          };

          // Simpan ke daftar learned vocab di memori
          const existingIdx = learnedVocabList.findIndex(v => v.term_maanyan.toLowerCase() === detectedLearning.term.toLowerCase());
          const newItem: LearnedVocabItem = {
            id: String(Date.now()),
            term_maanyan: detectedLearning.term,
            meaning_indonesian: detectedLearning.meaning,
            category: detectedLearning.category,
            example_sentence: detectedLearning.example,
            contributor: "Chat User",
            created_at: new Date().toISOString()
          };

          if (existingIdx >= 0) {
            learnedVocabList[existingIdx] = newItem;
          } else {
            learnedVocabList.unshift(newItem);
          }

          // Simpan ke Turso
          await insertVocabToTurso(
            detectedLearning.term,
            detectedLearning.meaning,
            detectedLearning.category,
            detectedLearning.example,
            "Chat User"
          );
        }
      } catch (err) {
        console.warn("Gagal mendeteksi auto learning:", err);
      }
    }

    // 2. Generate balasan dengan dynamic system instruction
    const systemInstruction = buildSystemInstruction(mode as "chat" | "latihan");

    // Format history
    const contents: any[] = [];
    if (Array.isArray(history)) {
      for (const item of history.slice(-6)) {
        contents.push({
          role: item.role === "user" ? "user" : "model",
          parts: [{ text: item.text }]
        });
      }
    }
    contents.push({
      role: "user",
      parts: [{ text: message }]
    });

    const response = await generateGeminiContent(contents, {
      systemInstruction: systemInstruction,
      temperature: mode === "chat" ? 0.7 : 0.4
    });

    res.json({
      reply: response.text || "Puang ka'itung... Maaf terjadi kendala jaringan.",
      detectedLearning: detectedLearning,
      totalLearned: learnedVocabList.length
    });

  } catch (error: any) {
    console.error("Chat API Error:", error);
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
    }
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
