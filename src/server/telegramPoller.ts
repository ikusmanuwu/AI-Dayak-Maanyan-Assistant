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
  onLearn: (term: string, meaning: string, category: string, example?: string) => void
) {
  if (pollingActive) return;
  pollingActive = true;
  botStatus.isRunning = true;
  botStatus.error = undefined;

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

              // Check auto-learning
              const triggers = ["artinya", "artian", "harusnya", "salah", "koreksi", "beda", "maanyan", "kata", "bukan", "adalah"];
              const hasTrigger = triggers.some(t => text.toLowerCase().includes(t));

              if (hasTrigger && aiClient) {
                try {
                  const detectionPrompt = `Analisis apakah pesan Telegram ini mengajarkan kosakata baru atau mengoreksi kata Dayak Ma'anyan:\n"${text}"\nKembalikan HANYA format JSON:\n{\n  "is_teaching": true/false,\n  "term": "kata ma'anyan atau kosongkan",\n  "meaning": "arti indonesia atau kosongkan",\n  "category": "kategori",\n  "example": "contoh kalimat jika ada"\n}`;
                  const det = await aiClient.models.generateContent({
                    model: "gemini-3.1-flash-lite",
                    contents: detectionPrompt,
                    config: { responseMimeType: "application/json", temperature: 0.1 }
                  });
                  const parsed = JSON.parse(det.text?.trim() || "{}");
                  if (parsed.is_teaching && parsed.term && parsed.meaning) {
                    onLearn(parsed.term, parsed.meaning, parsed.category || "Kosakata Baru (Telegram)", parsed.example || "");
                  }
                } catch (e) {
                  console.warn("[Telegram Auto-Learn Error]", e);
                }
              }

              // Generate AI response
              try {
                const sysInstruction = buildSystemInstruction(mode);
                const aiResp = await aiClient.models.generateContent({
                  model: "gemini-3.1-flash-lite",
                  contents: [{ role: "user", parts: [{ text }] }],
                  config: {
                    systemInstruction: sysInstruction,
                    temperature: mode === "chat" ? 0.7 : 0.4
                  }
                });

                const replyText = aiResp.text || "Puang ka'itung... Maaf bot sedang berpikir.";
                await sendTelegramMessage(token, chatId, replyText);
              } catch (err: any) {
                console.error("[Telegram Reply Error]", err);
                await sendTelegramMessage(token, chatId, "Maaf, terjadi sedikit kendala saat menghubungi otak AI. Coba tanyakan lagi ya!");
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

async function sendTelegramMessage(token: string, chatId: number | string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    });
  } catch (err) {
    console.error("[Telegram Send Error]", err);
  }
}
