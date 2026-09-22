"""
bot.py
Aplikasi Utama Telegram Bot: "Asisten & Model Bahasa Dayak Ma'anyan"
Menggunakan:
- python-telegram-bot (v20+ async)
- google-genai SDK terbaru
- sqlite3 untuk penyimpanan ingatan/kosakata baru secara rekursif

Dibuat dengan standar Senior Software Engineer & AI Architect.
"""

import os
import sys
import logging
from typing import Dict, List
from dotenv import load_dotenv

# Muat variabel environment dari .env
load_dotenv()

from telegram import (
    Update,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    constants
)
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ContextTypes,
    filters
)

# Import modul internal
from database import (
    init_db,
    get_user_mode,
    set_user_mode,
    get_all_learned_vocab,
    get_all_learned_rules,
    search_vocab,
    get_stats,
    reset_all_learned
)
from knowledge_base import CORE_VOCABULARY
from gemini_brain import (
    generate_maanyan_response,
    detect_and_learn_from_message
)

# Konfigurasi Logging
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Penyimpanan riwayat obrolan in-memory sederhana per user
user_chat_histories: Dict[int, List[Dict[str, str]]] = {}

def get_mode_keyboard(current_mode: str) -> InlineKeyboardMarkup:
    """Membuat keyboard interaktif untuk memilih mode percakapan."""
    chat_label = "✅ Mode Chat (Aktif)" if current_mode == "chat" else "💬 Mode Chat (Roleplay)"
    latihan_label = "✅ Mode Latihan (Aktif)" if current_mode == "latihan" else "🎯 Mode Latihan (Uji Coba)"
    
    keyboard = [
        [InlineKeyboardButton(chat_label, callback_data="mode_chat")],
        [InlineKeyboardButton(latihan_label, callback_data="mode_latihan")],
        [
            InlineKeyboardButton("📖 Buka Kamus", callback_data="cmd_kamus"),
            InlineKeyboardButton("🧠 Memori Baru", callback_data="cmd_memori")
        ]
    ]
    return InlineKeyboardMarkup(keyboard)

# ==================== HANDLER PERINTAH (COMMANDS) ====================

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler untuk perintah /start."""
    user = update.effective_user
    user_id = user.id
    username = user.first_name or user.username or "Sahabat"
    
    # Ambil mode saat ini dari database
    current_mode = get_user_mode(user_id)
    
    welcome_text = f"""
🌿 *Tabe! Salam Hangat.*
Selamat datang di *Asisten & Model Bahasa Dayak Ma'anyan*, Kak *{username}*!

Saya adalah bot kecerdasan buatan berbasis Gemini yang dilatih khusus dengan tata bahasa dan kosakata otentik Dayak Ma'anyan (Kalimantan Tengah / Barito Timur).

✨ *Fitur Unggulan Bot:*
1. 🧠 *Core Knowledge Base*: Menguasai kosakata dasar, tingkat kelaparan (_layah -> kalauan -> hinut_), konjungsi (_daya, kude, nelang, dadijari_), dan idiom otentik.
2. 🔄 *Dynamic Auto-Learning*: Setiap kali Anda mengoreksi atau mengajarkan kata baru di chat biasa, bot akan *otomatis mencatatnya ke SQLite* dan menggunakannya langsung!
3. 🎭 *Dual-Mode Percakapan*:
   - *Mode Chat / Roleplay*: Mengobrol santai seperti penutur asli.
   - *Mode Latihan / Testing*: Latihan interaktif, kuis tebak kata, dan tantangan terjemahan.

📌 *Mode Aktif Saat Ini:* `{current_mode.upper()}`

Gunakan menu di bawah untuk mulai menjelajah atau ketik langsung pesan Anda:
"""
    await update.message.reply_text(
        welcome_text,
        parse_mode=constants.ParseMode.MARKDOWN,
        reply_markup=get_mode_keyboard(current_mode)
    )

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler untuk perintah /help."""
    help_text = """
📚 *Daftar Perintah Bot Bahasa Dayak Ma'anyan:*

🔹 `/start` - Mulai ulang bot & tampilkan menu utama.
🔹 `/mode` - Ganti mode antara *Chat Santai* & *Latihan Interaktif*.
🔹 `/chat` - Beralih langsung ke Mode Chat / Roleplay.
🔹 `/latihan` - Beralih langsung ke Mode Latihan & Uji Coba.
🔹 `/kamus [kata]` - Cari kata di kamus inti atau cari kata tertentu.
🔹 `/memori` - Lihat daftar kosakata baru yang telah dipelajari bot dari pengguna.
🔹 `/stats` - Lihat statistik memori dan database bot.
🔹 `/help` - Tampilkan panduan ini.

💡 *Tips Mengajarkan Kata Baru (Auto-Learning):*
Cukup ketik secara alami di chat, contohnya:
- _"Bahasa Ma'anyan nya kucing itu miow"_
- _"Salah, harusnya ranu artinya air minum"_
- _"Kalau kata wusah itu artinya hujan"_

Bot akan langsung mengekstrak dan mengingatnya ke database lokal!
"""
    await update.message.reply_text(help_text, parse_mode=constants.ParseMode.MARKDOWN)

async def mode_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler untuk perintah /mode."""
    user_id = update.effective_user.id
    current_mode = get_user_mode(user_id)
    await update.message.reply_text(
        f"⚙️ *Pengaturan Mode Percakapan*\n\nMode Anda saat ini: *{current_mode.upper()}*\nPilih mode yang Anda inginkan:",
        parse_mode=constants.ParseMode.MARKDOWN,
        reply_markup=get_mode_keyboard(current_mode)
    )

async def set_chat_mode(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Beralih cepat ke mode chat via /chat."""
    user = update.effective_user
    set_user_mode(user.id, user.first_name, "chat")
    await update.message.reply_text(
        "💬 *Mode Chat & Roleplay Diaktifkan!*\n\nSekarang saya akan mengobrol santai sebagai penutur asli Dayak Ma'anyan dengan terjemahan bahasa Indonesia.\n\nContoh pembuka: *\"Hie ngaran nu?\"* (Siapa namamu?)",
        parse_mode=constants.ParseMode.MARKDOWN,
        reply_markup=get_mode_keyboard("chat")
    )

async def set_latihan_mode(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Beralih cepat ke mode latihan via /latihan."""
    user = update.effective_user
    set_user_mode(user.id, user.first_name, "latihan")
    
    # Langsung kirimkan soal latihan pembuka dari Gemini
    prompt_opening = "Berikan satu soal latihan pertama untuk saya dalam bahasa Dayak Ma'anyan (bisa tebak kata atau terjemahan sederhana)."
    response = generate_maanyan_response(prompt_opening, user.id, mode="latihan")
    
    await update.message.reply_text(
        f"🎯 *Mode Latihan & Interactive Testing Diaktifkan!*\n\nMari menguji kemampuan bahasa Dayak Ma'anyan Anda.\n\n{response}",
        parse_mode=constants.ParseMode.MARKDOWN,
        reply_markup=get_mode_keyboard("latihan")
    )

async def kamus_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler untuk perintah /kamus [kata]."""
    args = context.args
    if args:
        keyword = " ".join(args).strip()
        # Cari di Core KB
        core_matches = [
            f"• *{v['term']}* = {v['meaning']} _({v['category']})_"
            for v in CORE_VOCABULARY
            if keyword.lower() in v['term'].lower() or keyword.lower() in v['meaning'].lower()
        ]
        # Cari di SQLite
        learned_matches = search_vocab(keyword)
        learned_formatted = [
            f"• *{v['term_maanyan']}* = {v['meaning_indonesian']} _({v['category']})_ [Hasil Belajar]"
            for v in learned_matches
        ]
        
        all_results = core_matches + learned_formatted
        if all_results:
            msg = f"🔍 *Hasil Pencarian untuk '{keyword}':*\n\n" + "\n".join(all_results[:15])
        else:
            msg = f"🔍 Tidak ditemukan kata *'{keyword}'* di kamus inti maupun memori. Anda bisa mengajarkannya dengan mengetik di chat biasa!"
        await update.message.reply_text(msg, parse_mode=constants.ParseMode.MARKDOWN)
    else:
        # Tampilkan ringkasan kamus inti
        lines = ["📖 *Kamus Inti Dayak Ma'anyan (Sebagian)*:"]
        for v in CORE_VOCABULARY[:12]:
            lines.append(f"• *{v['term']}* = {v['meaning']}")
        lines.append("\n_Gunakan `/kamus <kata>` untuk mencari kosakata spesifik._")
        await update.message.reply_text("\n".join(lines), parse_mode=constants.ParseMode.MARKDOWN)

async def memori_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler untuk menampilkan hasil auto-learning dari SQLite."""
    learned_vocab = get_all_learned_vocab()
    learned_rules = get_all_learned_rules()
    
    if not learned_vocab and not learned_rules:
        await update.message.reply_text(
            "🧠 *Memori Auto-Learning Masih Kosong*\n\nBot belum menerima kosakata atau aturan baru dari percakapan. Coba ajarkan sesuatu seperti:\n_\"Kata wusah artinya hujan di Ma'anyan\"_",
            parse_mode=constants.ParseMode.MARKDOWN
        )
        return
        
    lines = [f"🧠 *Memori Dinamis SQLite ({len(learned_vocab)} Kosakata Dipelajari):*\n"]
    for item in learned_vocab[:15]:
        example = f" - Contoh: _{item['example_sentence']}_" if item.get('example_sentence') else ""
        lines.append(f"• *{item['term_maanyan']}* = {item['meaning_indonesian']} ({item['category']}){example}")
        
    if learned_rules:
        lines.append(f"\n📜 *Aturan Baru ({len(learned_rules)}):*")
        for r in learned_rules[:5]:
            lines.append(f"• *{r['title']}*: {r['rule_description']}")
            
    lines.append("\n✨ _Seluruh memori ini disuntikkan secara dinamis ke instruksi Gemini setiap kali bot merespon!_")
    await update.message.reply_text("\n".join(lines), parse_mode=constants.ParseMode.MARKDOWN)

async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler statistik bot."""
    stats = get_stats()
    msg = f"""
📊 *Statistik Bot Bahasa Dayak Ma'anyan:*
• Kosakata Inti (Core KB): *{len(CORE_VOCABULARY)} kata*
• Kosakata Baru Dipelajari (SQLite): *{stats['total_learned_vocab']} kata*
• Aturan Tata Bahasa Baru: *{stats['total_learned_rules']} aturan*
• Total Pengguna Terdaftar: *{stats['total_users']} pengguna*
• Engine AI: *Google Gemini (SDK google-genai)*
• Database: *SQLite3 (Lokal & Otomatis)*
"""
    await update.message.reply_text(msg, parse_mode=constants.ParseMode.MARKDOWN)

# ==================== HANDLER INTERAKSI TOMBOL (CALLBACK QUERY) ====================

async def handle_callback_query(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Menangani klik tombol inline menu."""
    query = update.callback_query
    await query.answer()
    
    user_id = query.from_user.id
    username = query.from_user.first_name
    data = query.data
    
    if data == "mode_chat":
        set_user_mode(user_id, username, "chat")
        await query.edit_message_text(
            "💬 *Mode Chat & Roleplay Diaktifkan!*\n\nSekarang Anda dapat mengobrol santai dalam bahasa Dayak Ma'anyan.\nKetik apa saja untuk mulai mengobrol!",
            parse_mode=constants.ParseMode.MARKDOWN,
            reply_markup=get_mode_keyboard("chat")
        )
    elif data == "mode_latihan":
        set_user_mode(user_id, username, "latihan")
        prompt_opening = "Berikan satu soal latihan pertama untuk saya dalam bahasa Dayak Ma'anyan (bisa tebak kata atau terjemahan)."
        response = generate_maanyan_response(prompt_opening, user_id, mode="latihan")
        await query.edit_message_text(
            f"🎯 *Mode Latihan & Testing Diaktifkan!*\n\n{response}",
            parse_mode=constants.ParseMode.MARKDOWN,
            reply_markup=get_mode_keyboard("latihan")
        )
    elif data == "cmd_kamus":
        lines = ["📖 *Kamus Inti Dayak Ma'anyan (Ringkasan)*:"]
        for v in CORE_VOCABULARY[:10]:
            lines.append(f"• *{v['term']}* = {v['meaning']}")
        lines.append("\n_Ketik `/kamus <kata>` untuk pencarian spesifik._")
        await query.message.reply_text("\n".join(lines), parse_mode=constants.ParseMode.MARKDOWN)
    elif data == "cmd_memori":
        learned = get_all_learned_vocab()
        if not learned:
            await query.message.reply_text("🧠 Memori SQLite masih kosong. Belum ada kata baru yang diajarkan.")
        else:
            txt = f"🧠 *{len(learned)} Kosakata Tersimpan di Database SQLite:*\n" + "\n".join([f"• {x['term_maanyan']} = {x['meaning_indonesian']}" for x in learned[:10]])
            await query.message.reply_text(txt, parse_mode=constants.ParseMode.MARKDOWN)

# ==================== HANDLER PESAN TEKS UTAMA (CHAT & LEARNING) ====================

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Handler utama untuk semua pesan teks:
    1. Melakukan deteksi auto-learning via Gemini
    2. Jika mendeteksi koreksi/pengajaran baru -> simpan ke SQLite & kirim notifikasi
    3. Menghasilkan respon sesuai mode pengguna (Chat atau Latihan)
    """
    user = update.effective_user
    user_id = user.id
    user_text = update.message.text
    
    if not user_text:
        return

    # Tampilkan status 'typing' di Telegram
    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action=constants.ChatAction.TYPING)

    # 1. Deteksi Auto-Learning Rekursif
    learning_result = detect_and_learn_from_message(
        user_message=user_text,
        contributor=f"{user.first_name} (@{user.username})" if user.username else user.first_name
    )
    
    # Jika terdeteksi ada kata atau aturan baru yang diajarkan
    if learning_result:
        saved_items = learning_result.get("saved_items", [])
        rule_data = learning_result.get("rule")
        
        notif_lines = ["💡 *Ingatan Baru Disimpan ke Database SQLite!*"]
        if saved_items:
            notif_lines.append(f"Kosakata baru: *{', '.join(saved_items)}*")
        if rule_data:
            notif_lines.append(f"Aturan baru: *{rule_data.get('title')}* - _{rule_data.get('rule_description')}_")
        notif_lines.append("✅ _Pengetahuan ini langsung disuntikkan ke System Instruction untuk respon berikutnya._")
        
        await update.message.reply_text(
            "\n".join(notif_lines),
            parse_mode=constants.ParseMode.MARKDOWN
        )

    # 2. Ambil Riwayat Percakapan Pengguna
    history = user_chat_histories.get(user_id, [])
    current_mode = get_user_mode(user_id)

    # 3. Generate Respon Percakapan Berdasarkan Dynamic Knowledge Base
    bot_reply = generate_maanyan_response(
        user_message=user_text,
        user_id=user_id,
        mode=current_mode,
        chat_history=history
    )

    # Simpan riwayat percakapan
    history.append({"role": "user", "text": user_text})
    history.append({"role": "model", "text": bot_reply})
    user_chat_histories[user_id] = history[-10:] # simpan 10 terakhir

    # Kirim balasan ke Telegram
    await update.message.reply_text(
        bot_reply,
        parse_mode=constants.ParseMode.MARKDOWN
    )

# ==================== ENTRY POINT UTAMA ====================

def main():
    """Fungsi utama untuk memulai Telegram Bot."""
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token or token == "YOUR_TELEGRAM_BOT_TOKEN":
        print("\n❌ ERROR: TELEGRAM_BOT_TOKEN belum disetel di file .env!")
        print("Silakan buka file .env dan isi TELEGRAM_BOT_TOKEN dari @BotFather di Telegram.")
        print("Lihat petunjuk lengkap pada README.md.\n")
        sys.exit(1)

    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        print("\n❌ ERROR: GEMINI_API_KEY belum disetel di file .env!")
        print("Dapatkan gratis di https://aistudio.google.com/ dan tempel di file .env.\n")
        sys.exit(1)

    # Inisialisasi Database SQLite
    init_db()
    print("✅ Database SQLite (maanyan_memory.db) siap.")

    # Bangun Aplikasi Bot
    app = ApplicationBuilder().token(token).build()

    # Daftarkan Command Handlers
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("mode", mode_command))
    app.add_handler(CommandHandler("chat", set_chat_mode))
    app.add_handler(CommandHandler("latihan", set_latihan_mode))
    app.add_handler(CommandHandler("kamus", kamus_command))
    app.add_handler(CommandHandler("memori", memori_command))
    app.add_handler(CommandHandler("stats", stats_command))

    # Daftarkan Callback Query Handler (tombol inline)
    app.add_handler(CallbackQueryHandler(handle_callback_query))

    # Daftarkan Message Handler untuk teks biasa
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    print("🚀 Telegram Bot Dayak Ma'anyan sedang berjalan (Polling mode)...")
    print("Tekan Ctrl+C untuk menghentikan bot.")
    
    # Jalankan bot dengan long-polling
    app.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
