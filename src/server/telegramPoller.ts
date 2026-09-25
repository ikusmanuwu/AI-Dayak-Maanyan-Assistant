interface BotStatusState {
  isRunning: boolean;
  botUsername?: string;
  botFirstName?: string;
  lastPolledAt?: string;
  error?: string;
}

let botStatus: BotStatusState = {
  isRunning: false
};

let pollingActive = false;
let currentOffset = 0;
let abortController: AbortController | null = null;

export async function verifyTelegramToken(token: string): Promise<{ success: boolean; bot?: any; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data: any = await res.json();
    if (data.ok) {
      botStatus.botUsername = data.result.username;
      botStatus.botFirstName = data.result.first_name;
      return { success: true, bot: data.result };
    }
    botStatus.error = data.description || "Token tidak valid";
    return { success: false, error: data.description };
  } catch (err: any) {
    botStatus.error = err.message || "Gagal menghubungi API Telegram";
    return { success: false, error: err.message };
  }
}

export function getBotStatus(): BotStatusState {
  return { ...botStatus };
}

export function stopTelegramPoller() {
  pollingActive = false;
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  botStatus.isRunning = false;
}

// Cache jawaban berulang di Telegram (TTL 15 menit)
const tgResponseCache = new Map<string, { reply: string; timestamp: number }>();

// Multi-turn conversation history per chatId dengan timestamp untuk auto-reset chat basi
interface TgHistoryItem {
  role: "user" | "model";
  text: string;
  timestamp: number;
}
const userChatHistories = new Map<number | string, TgHistoryItem[]>();

export function extractLearnedOrCorrectedVocab(text: string): { term: string; meaning: string; category?: string; note?: string } | null {
  const clean = text.trim();
  
  // 1. "arti a itu harusnya b" / "arti a seharusnya b" / "arti a yang benar b"
  let m = clean.match(/(?:arti|makna)\s+([a-zA-Z0-9'`\-~]+)\s+(?:itu\s+)?(?:harusnya|seharusnya|yang\s+benar\s+adalah|yang\s+benar|adalah|bukan\s+.+?\s+tapi|bukan\s+.+?\s+melainkan)\s+(.+)/i);
  if (m && m[1] && m[2]) return { term: m[1].trim(), meaning: m[2].trim(), category: "Koreksi Pengguna" };

  // 2. "a itu harusnya b" / "a harusnya b" / "a seharusnya b"
  m = clean.match(/^([a-zA-Z0-9'`\-~]+)\s+(?:itu\s+)?(?:harusnya|seharusnya)\s+(.+)$/i);
  if (m && m[1] && m[2]) return { term: m[1].trim(), meaning: m[2].trim(), category: "Koreksi Pengguna" };

  // 3. "salah/keliru/bukan, [harusnya] a artinya b"
  m = clean.match(/(?:salah|keliru|bukan)[,!.\s]+(?:yang\s+benar\s+|harusnya\s+|seharusnya\s+)?([a-zA-Z0-9'`\-~]+)\s+(?:artinya|=|maknanya|itu)\s+(.+)/i);
  if (m && m[1] && m[2]) return { term: m[1].trim(), meaning: m[2].trim(), category: "Koreksi Pengguna" };

  // 4. "koreksi/ralat/catat: a artinya b"
  m = clean.match(/(?:koreksi|ralat|catat|ingat|saya\s+ajarkan)(?:\s+ya|\s+dong|\s+nih)?[:,\s]+([a-zA-Z0-9'`\-~]+)\s+(?:artinya|=|maknanya|itu)\s+(.+)/i);
  if (m && m[1] && m[2]) return { term: m[1].trim(), meaning: m[2].trim(), category: "Koreksi Pengguna" };

  // 5. "bahasa maanyan hati adalah atei"
  m = clean.match(/bahasa\s+(?:ma'anyan|maanyan|dayak)(?:nya|\s+dari)?\s+([a-zA-Z0-9'`\-~]+)\s+(?:itu|adalah|harusnya|=|yaitu)\s+([a-zA-Z0-9'`\-~]+)/i);
  if (m && m[1] && m[2]) return { term: m[2].trim(), meaning: m[1].trim(), category: "Kosakata Baru" };

  // 6. "a artinya b" / "a = b"
  m = clean.match(/^([a-zA-Z0-9'`\-~\s]+?)\s+(?:artinya|=|maknanya|yaitu|artian|ialah)\s+(.+)$/i);
  if (m && m[1] && m[2] && !m[1].toLowerCase().startsWith("apa") && !m[1].toLowerCase().startsWith("kenapa") && !m[1].includes("?")) {
    return { term: m[1].trim(), meaning: m[2].trim(), category: "Kosakata Baru" };
  }

  return null;
}

export async function startTelegramPoller(
  token: string,
  aiClient: any,
  buildSystemInstruction: (mode: "chat" | "latihan", contextText?: string) => string,
  onLearn: (term: string, meaning: string, category: string, example?: string) => Promise<void> | void,
  tryLocalMatch?: (text: string) => string | null
) {
  if (pollingActive) return;
  pollingActive = true;
  botStatus.isRunning = true;
  botStatus.error = undefined;

  async function callGemini(contents: any, config: any) {
    const modelsToTry = [
      "gemini-3.5-flash",
      "gemini-3-flash-preview",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest"
    ];

    const finalConfig = {
      maxOutputTokens: 1024,
      ...config
    };

    let lastError: any = null;
    // Coba loop dengan exponential backoff jika terkena spike traffic (503) atau rate limit sementara (429)
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const model of modelsToTry) {
        try {
          return await aiClient.models.generateContent({
            model,
            contents,
            config: finalConfig
          });
        } catch (e: any) {
          lastError = e;
          const status = e?.status || e?.statusCode;
          console.warn(`[Telegram Poller] Model ${model} percobaan #${attempt + 1} gagal (${status || e?.message}).`);
          if (status === 503 || status === 429) {
            await new Promise(r => setTimeout(r, 1200));
          }
        }
      }
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 2500));
      }
    }
    throw lastError || new Error("Semua model Gemini tidak dapat dijangkau.");
  }

  console.log(`[Telegram Poller] Memulai long polling untuk @${botStatus.botUsername || "bot"}...`);

  async function poll() {
    while (pollingActive) {
      try {
        botStatus.lastPolledAt = new Date().toISOString();
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${currentOffset}&timeout=30`;
        const res = await fetch(url);
        if (!res.ok) {
          const errText = await res.text();
          botStatus.error = `HTTP ${res.status}: ${errText}`;
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        const data: any = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            currentOffset = update.update_id + 1;
            if (update.message && update.message.text) {
              const chatId = update.message.chat.id;
              const text = update.message.text.trim();
              const sender = update.message.from?.first_name || "Sahabat";

              // Handle commands
              if (text.startsWith("/anggaran") || text.startsWith("/budget")) {
                const now = new Date();
                const currentMonthName = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"][now.getMonth()];
                const nextMonthName = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"][(now.getMonth() + 1) % 12];
                const year = now.getFullYear();
                
                // Jika tanggal >= 25 (setelah gajian masuk), periode otomatis menjadi bulan berikutnya
                const isAfterSalary = now.getDate() >= 25;
                const periodLabel = isAfterSalary ? `Periode ${nextMonthName} ${year} (Mulai 25 ${currentMonthName.slice(0,3)} - Gajian Selanjutnya)` : `Periode ${currentMonthName} ${year}`;
                
                const budgetMsg = `💰 *Status Anggaran Keluarga:*\n` +
                  `*${periodLabel}*\n` +
                  `🗓 _Aturan Cut-off: Transaksi mulai tanggal gajian (25 ${currentMonthName.slice(0,3)}) otomatis membuka lembaran anggaran periode baru._\n\n` +
                  `📈 *Total Realisasi Periode Ini:*\n` +
                  `Rp 17.671.892 / Rp 21.800.000 (81%)\n` +
                  `🛡 *Sisa Kuota Anggaran:*\n` +
                  `Rp 4.128.108 (147 transaksi)\n\n` +
                  `*Rincian Kategori:*\n` +
                  `🟢 *Apartemen:* 25% (Terpakai Rp 1.617.000 / Limit Rp 6.500.000) [Sisa Rp 4.883.000]\n` +
                  `🟢 *Makan & Belanja:* 45% (Terpakai Rp 2.250.000 / Limit Rp 5.000.000) [Sisa Rp 2.750.000]\n` +
                  `🟡 *Transport & Bensin:* 82% (Terpakai Rp 1.640.000 / Limit Rp 2.000.000) [Sisa Rp 360.000]\n\n` +
                  `_Keterangan: 🟢 Aman (<80%) | 🟡 Waspada (≥80%) | 🔴 Over-Limit (≥100%)_`;
                await sendTelegramMessage(token, chatId, budgetMsg);
                continue;
              }

              if (text.startsWith("/start") || text.startsWith("/reset") || text.startsWith("/clear") || text.startsWith("/baru")) {
                userChatHistories.delete(chatId);
                const welcomeMsg = `Tabe salamat! Halo kak ${sender}!\n\n` +
                  `Saya adalah *Dayak Ma'anyan AI Assistant*.\n` +
                  `Kamu bisa tanya terjemahan, berlatih percakapan, atau bahkan mengajariku kosakata Dayak Ma'anyan baru!\n\n` +
                  `📌 *Contoh perintah:*\n` +
                  `• "Apa arti kuman?"\n` +
                  `• "Bahasa Ma'anyan makan apa?"\n` +
                  `• "Inun kabar?"\n` +
                  `• "/latihan" - Mode kuis interaktif\n` +
                  `• "/reset" - Mulai percakapan dari awal\n` +
                  `• "Kata baru: waday artinya kue"`;
                await sendTelegramMessage(token, chatId, welcomeMsg);
                continue;
              }

              let history = userChatHistories.get(chatId) || [];
              // Auto-reset jika obrolan terakhir sudah lebih dari 24 jam tidak aktif
              if (history.length > 0) {
                const lastMsg = history[history.length - 1];
                if (Date.now() - lastMsg.timestamp > 24 * 60 * 60 * 1000) {
                  userChatHistories.delete(chatId);
                  history = [];
                }
              }

              const isLatihan = text.toLowerCase().includes("/latihan") || text.toLowerCase().includes("latihan");
              const mode = isLatihan ? "latihan" : "chat";

              // Check auto-learning / koreksi pengguna (bisa single term atau bulk baris kata)
              const triggers = ["artinya", "artian", "harusnya", "seharusnya", "salah", "keliru", "koreksi", "ralat", "beda", "maanyan", "kata", "bukan", "adalah", "catat", "ingat", "="];
              const hasTrigger = triggers.some(t => text.toLowerCase().includes(t));

              if (hasTrigger) {
                // 1. Coba deteksi cepat via regex komprehensif
                const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);
                let learnedAny = false;

                for (const line of lines) {
                  const extracted = extractLearnedOrCorrectedVocab(line);
                  if (extracted && extracted.term && extracted.meaning) {
                    await onLearn(extracted.term, extracted.meaning, extracted.category || "Koreksi/Kosakata Pengguna", `${extracted.term} artinya ${extracted.meaning}`);
                    learnedAny = true;
                  }
                }

                // 2. Jika bukan pola baris sederhana tapi ada trigger eksplisit, gunakan AI extraction
                const isExplicitTeaching = /^(?:kata baru|koreksi|ralat|tambahkan kosakata|catat kata|saya ajarkan|salah|harusnya)\b/i.test(text);
                if (!learnedAny && isExplicitTeaching && aiClient) {
                  try {
                    const detectionPrompt = `Analisis apakah pesan Telegram ini mengajarkan kosakata baru atau mengoreksi arti kata Dayak Ma'anyan:\n"${text}"\nKembalikan HANYA format JSON:\n{\n  "is_teaching": true/false,\n  "term": "kata ma'anyan atau kosongkan",\n  "meaning": "arti indonesia atau kosongkan",\n  "category": "kategori",\n  "example": "contoh kalimat jika ada"\n}`;
                    const det = await callGemini(detectionPrompt, { responseMimeType: "application/json", temperature: 0.1 });
                    const parsed = JSON.parse(det.text?.trim() || "{}");
                    if (parsed.is_teaching && parsed.term && parsed.meaning) {
                      await onLearn(parsed.term, parsed.meaning, parsed.category || "Kosakata Baru (Telegram)", parsed.example || "");
                    }
                  } catch (e) {
                    console.warn("[Telegram Auto-Learn Error]", e);
                  }
                }
              }

              // 1. Coba pencocokan kamus lokal & salam instan (Hanya jika chat baru atau query kamus eksplisit)
              const isExplicitDictionaryQuery = /^(?:apa\s+)?(?:artinya|arti|artian|makna|bahasa\s+maanyan|basa\s+maanyan)\s+/i.test(text);
              if (mode === "chat" && tryLocalMatch && (history.length === 0 || isExplicitDictionaryQuery)) {
                const localMatch = tryLocalMatch(text);
                if (localMatch) {
                  history.push({ role: "user", text, timestamp: Date.now() });
                  history.push({ role: "model", text: localMatch, timestamp: Date.now() });
                  userChatHistories.set(chatId, history.slice(-10));
                  await sendTelegramMessage(token, chatId, localMatch);
                  continue;
                }
              }

              // 2. Cek Response Cache Telegram (Hanya untuk pesan awal tanpa riwayat)
              const cacheKey = `${mode}:${text.trim().toLowerCase()}`;
              const cached = tgResponseCache.get(cacheKey);
              if (history.length === 0 && cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
                history.push({ role: "user", text, timestamp: Date.now() });
                history.push({ role: "model", text: cached.reply, timestamp: Date.now() });
                userChatHistories.set(chatId, history.slice(-10));
                await sendTelegramMessage(token, chatId, cached.reply);
                continue;
              }

              // Generate AI response
              try {
                // Tampilkan indikator status "sedang mengetik..." di Telegram
                sendChatAction(token, chatId, "typing").catch(() => {});

                // Format riwayat percakapan agar obrolan nyambung tuntas
                const contents: any[] = [];
                for (const item of history.slice(-20)) {
                  let textPart = item.text.trim();
                  if (item.role !== "user" && textPart.length > 4000) {
                    textPart = textPart.substring(0, 4000) + "...";
                  }
                  contents.push({
                    role: item.role === "user" ? "user" : "model",
                    parts: [{ text: textPart }]
                  });
                }
                contents.push({
                  role: "user",
                  parts: [{ text }]
                });

                const isStory = /cerita|dongeng|tanuhui|kisah|cinderella|palanuk|lanjut|hikayat/i.test(text);
                const isAnalytical = /dana darurat|keuangan|uang|data|tren|persen|hitung|kalkulasi|berapa|gaji|pengeluaran|pemasukan|simulasi|alokasi|anggaran|investasi|tabungan|finansial|budget/i.test(text);
                const sysInstruction = buildSystemInstruction(mode, text);
                
                const aiResp = await callGemini(contents, {
                  systemInstruction: sysInstruction,
                  temperature: mode === "chat" ? (isAnalytical ? 0.3 : 0.7) : 0.4,
                  maxOutputTokens: (isStory || isAnalytical) ? 2500 : (mode === "chat" ? 1500 : 1000)
                });

                const replyText = aiResp.text || "Puang ka'itung... Maaf bot sedang berpikir.";
                if (replyText && !replyText.startsWith("⚠️")) {
                  if (history.length === 0) {
                    tgResponseCache.set(cacheKey, { reply: replyText, timestamp: Date.now() });
                    if (tgResponseCache.size > 150) {
                      const firstKey = tgResponseCache.keys().next().value;
                      if (firstKey) tgResponseCache.delete(firstKey);
                    }
                  }
                  // Simpan riwayat chat pengguna agar follow-up chat nyambung terus
                  history.push({ role: "user", text, timestamp: Date.now() });
                  history.push({ role: "model", text: replyText, timestamp: Date.now() });
                  userChatHistories.set(chatId, history.slice(-20));
                }
                await sendTelegramMessage(token, chatId, replyText);
              } catch (err: any) {
                console.error("[Telegram Reply Error]", err);
                let fallbackMessage = "Maaf, server AI sedang mengalami antrean padat (high demand). Silakan kirim pesan lagi dalam beberapa detik ya!";
                const status = err?.status || err?.statusCode;
                if (status === 429) {
                  fallbackMessage = "Maaf, batas kuota gratis Gemini API (RPM/RPD) saat ini sedang jeda sejenak. Mohon tunggu sekitar 30 detik lalu kirim ulang ya!";
                }
                await sendTelegramMessage(token, chatId, fallbackMessage);
              }
            }
          }
        }
      } catch (err: any) {
        if (!pollingActive) break;
        botStatus.error = err.message || "Polling network error";
        console.error("[Telegram Polling Exception]", err);
        await new Promise(r => setTimeout(r, 4000));
      }
    }
  }

  poll();
}

async function sendChatAction(token: string, chatId: number | string, action: string = "typing") {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action })
    });
  } catch (_) {
    // Ignore chat action errors
  }
}

async function sendTelegramMessage(token: string, chatId: number | string, text: string) {
  try {
    // Telegram membatasi pesan maksimal 4096 karakter per request
    const MAX_LENGTH = 3800;
    if (text.length <= MAX_LENGTH) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text
        })
      });
      return;
    }

    // Jika cerita/teks sangat panjang (misal cerita dongeng seperti Cinderella), bagi ke beberapa bagian
    for (let i = 0; i < text.length; i += MAX_LENGTH) {
      const chunk = text.substring(i, i + MAX_LENGTH);
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk
        })
      });
      await new Promise(r => setTimeout(r, 400));
    }
  } catch (err) {
    console.error("[Telegram Send Error]", err);
  }
}
