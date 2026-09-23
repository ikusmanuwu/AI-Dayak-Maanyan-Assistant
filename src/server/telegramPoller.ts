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

// Multi-turn conversation history per chatId untuk menjaga alur obrolan nyambung
const userChatHistories = new Map<number | string, { role: "user" | "model"; text: string }[]>();

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
      "gemini-3.1-flash-lite",
      "gemini-3-flash-preview",
      "gemini-flash-latest"
    ];

    const finalConfig = {
      maxOutputTokens: 600,
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
              if (text.startsWith("/start") || text.startsWith("/reset")) {
                userChatHistories.delete(chatId);
                const welcomeMsg = `Tabe salamat! Halo kak ${sender}!\n\n` +
                  `Saya adalah *Dayak Ma'anyan AI Assistant*.\n` +
                  `Kamu bisa tanya terjemahan, berlatih percakapan, atau bahkan mengajariku kosakata Dayak Ma'anyan baru!\n\n` +
                  `📌 *Contoh perintah:*\n` +
                  `• "Apa arti kuman?"\n` +
                  `• "Bahasa Ma'anyan makan apa?"\n` +
                  `• "Inun kabar?"\n` +
                  `• "/latihan" - Mode kuis interaktif\n` +
                  `• "Kata baru: waday artinya kue"`;
                await sendTelegramMessage(token, chatId, welcomeMsg);
                continue;
              }

              const history = userChatHistories.get(chatId) || [];
              const isLatihan = text.toLowerCase().includes("/latihan") || text.toLowerCase().includes("latihan");
              const mode = isLatihan ? "latihan" : "chat";

              // Check auto-learning (bisa single term atau bulk baris kata)
              const triggers = ["artinya", "artian", "harusnya", "salah", "koreksi", "beda", "maanyan", "kata", "bukan", "adalah", "="];
              const hasTrigger = triggers.some(t => text.toLowerCase().includes(t));

              if (hasTrigger) {
                // 1. Coba deteksi cepat pola baris: "<kata> artinya <arti>" atau "<kata> = <arti>"
                const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);
                let learnedAnyFromLines = false;

                for (const line of lines) {
                  const match = line.match(/^([a-zA-Z0-9'`\-~\s]+?)\s+(?:artinya|=|maknanya|yaitu)\s+(.+)$/i);
                  if (match && match[1] && match[2]) {
                    const term = match[1].trim();
                    const meaning = match[2].trim();
                    if (term.length > 1 && meaning.length > 1 && !term.toLowerCase().startsWith("kata baru")) {
                      await onLearn(term, meaning, "Kosakata Baru (Telegram)", `${term} artinya ${meaning}`);
                      learnedAnyFromLines = true;
                    }
                  }
                }

                // 2. Jika bukan pola baris sederhana, hanya gunakan AI jika ada keyword pengajaran eksplisit
                const isExplicitTeaching = /^(?:kata baru|koreksi|tambahkan kosakata|catat kata|saya ajarkan)\s*[:=-]/i.test(text);
                if (!learnedAnyFromLines && isExplicitTeaching && aiClient) {
                  try {
                    const detectionPrompt = `Analisis apakah pesan Telegram ini mengajarkan kosakata baru atau mengoreksi kata Dayak Ma'anyan:\n"${text}"\nKembalikan HANYA format JSON:\n{\n  "is_teaching": true/false,\n  "term": "kata ma'anyan atau kosongkan",\n  "meaning": "arti indonesia atau kosongkan",\n  "category": "kategori",\n  "example": "contoh kalimat jika ada"\n}`;
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
                  history.push({ role: "user", text });
                  history.push({ role: "model", text: localMatch });
                  userChatHistories.set(chatId, history.slice(-10));
                  await sendTelegramMessage(token, chatId, localMatch);
                  continue;
                }
              }

              // 2. Cek Response Cache Telegram (Hanya untuk pesan awal tanpa riwayat)
              const cacheKey = `${mode}:${text.trim().toLowerCase()}`;
              const cached = tgResponseCache.get(cacheKey);
              if (history.length === 0 && cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
                history.push({ role: "user", text });
                history.push({ role: "model", text: cached.reply });
                userChatHistories.set(chatId, history.slice(-10));
                await sendTelegramMessage(token, chatId, cached.reply);
                continue;
              }

              // Generate AI response
              try {
                // Tampilkan indikator status "sedang mengetik..." di Telegram
                sendChatAction(token, chatId, "typing").catch(() => {});

                // Format & compact riwayat percakapan agar obrolan nyambung
                const contents: any[] = [];
                for (const item of history.slice(-6)) {
                  let textPart = item.text.trim();
                  if (item.role === "model" && textPart.length > 800) {
                    textPart = textPart.substring(0, 800) + "...";
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

                const isStory = /cerita|dongeng|cinderella|palanuk/i.test(text);
                const sysInstruction = buildSystemInstruction(mode, text);
                const aiResp = await callGemini(contents, {
                  systemInstruction: sysInstruction,
                  temperature: mode === "chat" ? 0.7 : 0.4,
                  maxOutputTokens: isStory ? 800 : (mode === "chat" ? 500 : 350)
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
                  history.push({ role: "user", text });
                  history.push({ role: "model", text: replyText });
                  userChatHistories.set(chatId, history.slice(-10));
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
