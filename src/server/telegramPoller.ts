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

export async function startTelegramPoller(
  token: string,
  aiClient: any,
  buildSystemInstruction: (mode: "chat" | "latihan") => string,
  onLearn: (term: string, meaning: string, category: string, example?: string) => Promise<void> | void
) {
  if (pollingActive) return;
  pollingActive = true;
  botStatus.isRunning = true;
  botStatus.error = undefined;

  async function callGemini(contents: any, config: any) {
    const modelsToTry = [
      "gemini-3.8-flash",
      "gemini-flash-latest",
      "gemini-3.1-pro-preview"
    ];

    let lastError: any = null;
    for (const model of modelsToTry) {
      try {
        return await aiClient.models.generateContent({
          model,
          contents,
          config
        });
      } catch (e: any) {
        lastError = e;
        console.warn(`[Telegram Poller] Model ${model} gagal (${e?.status || e?.message}). Mencoba model cadangan...`);
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
              if (text.startsWith("/start")) {
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

                // 2. Jika bukan pola baris sederhana, gunakan deteksi AI Gemini
                if (!learnedAnyFromLines && aiClient) {
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

              // Generate AI response
              try {
                // Tampilkan indikator status "sedang mengetik..." di Telegram
                sendChatAction(token, chatId, "typing").catch(() => {});

                const sysInstruction = buildSystemInstruction(mode);
                const aiResp = await callGemini([{ role: "user", parts: [{ text }] }], {
                  systemInstruction: sysInstruction,
                  temperature: mode === "chat" ? 0.7 : 0.4
                });

                const replyText = aiResp.text || "Puang ka'itung... Maaf bot sedang berpikir.";
                await sendTelegramMessage(token, chatId, replyText);
              } catch (err: any) {
                console.error("[Telegram Reply Error]", err);
                const fallbackMessage = "Maaf, terjadi sedikit kendala saat menghubungi otak AI. Coba tanyakan lagi ya!";
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
