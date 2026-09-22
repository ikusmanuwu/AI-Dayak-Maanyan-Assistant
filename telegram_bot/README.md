# 🌿 Telegram Bot: Asisten & Model Bahasa Dayak Ma'anyan

Aplikasi Telegram Bot cerdas yang bertindak sebagai **Asisten & Model Bahasa Dayak Ma'anyan** (Kalimantan Tengah / Barito Timur). Menggunakan kecerdasan **Google Gemini AI terbaru (`google-genai` SDK)**, framework **`python-telegram-bot` (v20+ async)**, dan database lokal **SQLite3** untuk pembelajaran rekursif dinamis.

---

## 🌟 3 Fungsionalitas Utama

1. **Core Knowledge Base (Pengetahuan Inti Awal)**:
   - Terpasang aturan tata bahasa baku, susunan S-P-O / P-S, partikel penegas *tatu'u* (sangat), kata hubung (*daya/dagana, kude, dadijari, ekat, nelang, baya, sindrah, hayu, puang ka'itung, bapaner, luput*).
   - **Tingkat Kelaparan Unik Ma'anyan**: *layah* (lapar biasa) ➔ *kalauan* (sangat lapar) ➔ *hinut* (lapar lemas mau pingsan).
   - Kosakata dasar, kata tunjuk (*yiti/yina/yiru*), aktivitas & waktu (*bagawi, naragu, mangang, mandre, ta'ati, iengen, kariwe die*), pronomina, dan frasa sapaan *"Hie ngaran nu?"*.

2. **Dynamic Auto-Learning System (Belajar Rekursif Otomatis)**:
   - Bot secara cerdas mendeteksi jika Anda mengoreksi arti kata atau mengajarkan kosakata/aturan baru di obrolan Telegram biasa (misal: *"salah, harusnya kata X artinya Y"* atau *"kata wusah artinya hujan"*).
   - Gemini mengekstrak data kosakata baru tersebut dan menyimpannya langsung ke database lokal SQLite (`maanyan_memory.db`).
   - Setiap kali membalas percakapan berikutnya, bot **menggabungkan Core KB + Seluruh Kosakata Baru dari database ke dalam System Instruction Gemini secara dinamis**.

3. **Dual-Mode Percakapan**:
   - 💬 **Mode Chat / Roleplay**: Bot mengobrol santai dalam bahasa Dayak Ma'anyan otentik seperti penutur asli, dilengkapi terjemahan bahasa Indonesia di bawahnya.
   - 🎯 **Mode Latihan / Interactive Testing**: Bot menyusun kalimat latihan, kuis tebak kata, soal terjemahan, mengevaluasi jawaban Anda, dan memberikan penilaian ramah.

---

## 🚀 Petunjuk Langkah Demi Langkah (100% GRATIS)

### Langkah 1: Buat Bot Telegram & Dapatkan Token (Gratis - 1 Menit)
1. Buka aplikasi **Telegram** di HP atau Laptop Anda.
2. Cari akun resmi **[@BotFather](https://t.me/BotFather)** (yang memiliki centang biru terverifikasi).
3. Kirim pesan: `/start` lalu kirim: `/newbot`.
4. Beri **Nama Tampilan Bot**, misalnya: `Dayak Ma'anyan AI Assistant`.
5. Beri **Username Bot** yang diakhiri kata `bot`, misalnya: `maanyan_ai_bot` atau `dayak_maanyan_bot`.
6. BotFather akan langsung memberikan **HTTP API Token**, contohnya:
   ```
   7123456789:AAFlkjhgfdsazxcvbnm1234567890
   ```
   *Simpan token ini untuk dimasukkan ke file `.env`.*

---

### Langkah 2: Dapatkan Gemini API Key Gratis
1. Buka situs resmi **[Google AI Studio](https://aistudio.google.com/)** di browser Anda.
2. Masuk menggunakan akun Google / Gmail Anda.
3. Klik tombol biru **"Get API key"** di menu sebelah kiri.
4. Klik **"Create API key"** (Gratis, tidak memerlukan kartu kredit).
5. Salin API Key yang dihasilkan (awalan biasanya `AIzaSy...`).

---

### Langkah 3: Siapkan Lingkungan di Laptop / Server Anda
Pastikan Anda sudah menginstal **Python 3.10+**. Cek di terminal/command prompt:
```bash
python --version
# atau
python3 --version
```

1. Masuk ke folder proyek:
   ```bash
   cd telegram_bot
   ```

2. (Direkomendasikan) Buat virtual environment agar bersih:
   ```bash
   # Di Windows:
   python -m venv venv
   venv\Scripts\activate

   # Di Linux / Mac:
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Instal dependencies yang dibutuhkan:
   ```bash
   pip install -r requirements.txt
   ```

---

### Langkah 4: Buat File Konfigurasi `.env`
1. Salin file contoh `.env.example` menjadi `.env`:
   ```bash
   # Di Linux / Mac:
   cp .env.example .env

   # Di Windows Command Prompt:
   copy .env.example .env
   ```
2. Buka file `.env` menggunakan teks editor (Notepad, VS Code, atau nano).
3. Isi nilai token yang telah Anda dapatkan:
   ```env
   TELEGRAM_BOT_TOKEN="7123456789:AAFlkjhgfdsazxcvbnm1234567890"
   GEMINI_API_KEY="AIzaSyYourGeminiApiKeyHere"
   GEMINI_MODEL="gemini-3.6-flash"
   ```
4. Simpan file tersebut.

---

### Langkah 5: Jalankan Bot!
Jalankan file utama bot:
```bash
python bot.py
```

Jika berhasil, Anda akan melihat log seperti ini:
```
✅ Database SQLite (maanyan_memory.db) siap.
🚀 Telegram Bot Dayak Ma'anyan sedang berjalan (Polling mode)...
Tekan Ctrl+C untuk menghentikan bot.
```

Buka Telegram, cari username bot Anda, lalu klik **START** atau kirim `/start`!

---

## 📱 Daftar Perintah di Telegram

| Perintah | Deskripsi |
| :--- | :--- |
| `/start` | Memulai bot dan menampilkan sambutan serta tombol interaktif |
| `/chat` | Beralih ke **Mode Chat & Roleplay** (bicara santai ala penutur asli) |
| `/latihan` | Beralih ke **Mode Latihan** (kuis interaktif & tebak kata) |
| `/mode` | Menampilkan menu pemilihan mode percakapan |
| `/kamus` | Menampilkan ringkasan kamus Dayak Ma'anyan |
| `/kamus [kata]` | Mencari arti kata tertentu di kamus inti & memori belajar |
| `/memori` | Melihat semua kata baru yang sudah dipelajari bot dari chat |
| `/stats` | Melihat jumlah data kamus dan pengguna bot |
| `/help` | Menampilkan panduan penggunaan lengkap |

---

## 💡 Contoh Cara Mengajarkan Kata Baru (Auto-Learning)

Anda tidak perlu perintah rumit, cukup ngobrol biasa di Telegram:
- Pengguna: *"Kata wusah itu artinya hujan di bahasa Dayak Ma'anyan"*
  ➔ **Bot**: `💡 Ingatan Baru Disimpan ke Database SQLite! Kosakata baru: wusah (hujan)`
- Pengguna: *"Salah kak, kalau lewu itu artinya rumah bukan kampung"*
  ➔ **Bot**: Otomatis memperbarui definisi kata *lewu*.
- Pengguna: *"Bahasa Ma'anyan nya kucing itu miow"*
  ➔ **Bot**: Langsung mengingat dan menggunakan kata tersebut di obrolan selanjutnya!

---

## 🌐 Opsi Menjalankan Bot 24/7 Gratis (Cloud Hosting)

Jika Anda tidak ingin laptop menyala terus-menerus, Anda bisa mendeploy bot ini secara 100% gratis ke cloud:

### Opsi A: Render.com (Background Worker)
1. Unggah folder bot ke repository GitHub Anda (jadikan private atau public).
2. Buat akun di [Render.com](https://render.com/).
3. Klik **New** ➔ **Background Worker**.
4. Hubungkan repository GitHub Anda.
5. Set:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python bot.py`
6. Masukkan Environment Variables di dashboard Render:
   - `TELEGRAM_BOT_TOKEN`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL`: `gemini-3.6-flash`
7. Klik **Deploy** — Bot Anda sekarang berjalan 24 jam nonstop!

### Opsi B: Railway.app / Fly.io / VPS Gratis (Oracle Cloud Free Tier)
Bot menggunakan sistem *Long Polling*, sehingga tidak membutuhkan domain publik, SSL webhook, ataupun port terbuka. Cukup jalankan `python bot.py` di server mana pun!

---

## 📁 Struktur File Proyek

```
telegram_bot/
├── bot.py             # Script utama telegram bot (v20+ async)
├── gemini_brain.py    # Logika AI Gemini, auto-learning detector & dynamic prompt
├── knowledge_base.py  # Core KB: Kosakata inti, aturan tata bahasa, dialek
├── database.py        # Pengelola SQLite3 (maanyan_memory.db)
├── requirements.txt   # Daftar pustaka Python
├── .env.example       # Template environment variables
└── README.md          # Dokumentasi panduan lengkap
```

*Adil Ka' Talino, Bacuramin Ka' Saruga, Basengat Ka' Jubata.* Selamat belajar dan melestarikan Bahasa Dayak Ma'anyan! 🌿
