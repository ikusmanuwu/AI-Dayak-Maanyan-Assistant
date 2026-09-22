"""
gemini_brain.py
Otak Pemrosesan Bahasa Alami Gemini untuk Asisten Dayak Ma'anyan
Menggunakan official Google GenAI SDK (google-genai >= 1.0.0).
Fitur:
- Dynamic System Instruction Injection (Core KB + Dynamic SQLite Database)
- Auto-Learning Detector (Mengekstrak kosakata & aturan baru dari chat biasa)
- Dual-Mode Processing (Mode Chat/Roleplay & Mode Latihan/Interactive Testing)
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional
from google import genai
from google.genai import types

from knowledge_base import CORE_VOCABULARY, CORE_GRAMMAR_RULES, format_core_vocab_text, format_core_rules_text
from database import (
    get_all_learned_vocab,
    get_all_learned_rules,
    save_learned_vocab,
    save_learned_rule
)

logger = logging.getLogger(__name__)

# Konfigurasi Model
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

def get_genai_client() -> genai.Client:
    """Menginisialisasi client Google GenAI dengan API Key."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY belum disetel pada environment / file .env!")
    return genai.Client(api_key=api_key)

def build_dynamic_system_instruction(mode: str = "chat") -> str:
    """
    Membangun System Instruction dinamis secara realtime:
    Menggabungkan Core Knowledge Base + Seluruh Kosakata & Aturan yang baru dipelajari dari SQLite.
    """
    # 1. Kosakata & Aturan Inti (Bawaan)
    core_vocab_str = format_core_vocab_text()
    core_rules_str = format_core_rules_text()

    # 2. Kosakata & Aturan Tambahan dari SQLite (Hasil Belajar Rekursif)
    learned_vocab = get_all_learned_vocab()
    learned_rules = get_all_learned_rules()

    learned_vocab_str = ""
    if learned_vocab:
        learned_vocab_lines = [
            f"- {v['term_maanyan']} = {v['meaning_indonesian']} (Kategori: {v['category']}) "
            f"[Contoh: {v.get('example_sentence', '-')}] (Dipelajari dari percakapan Telegram)"
            for v in learned_vocab
        ]
        learned_vocab_str = "\n".join(learned_vocab_lines)
    else:
        learned_vocab_str = "(Belum ada kosakata tambahan yang dipelajari dari obrolan)."

    learned_rules_str = ""
    if learned_rules:
        learned_rules_lines = [
            f"- {r['title']}: {r['rule_description']} [Contoh: {r.get('example', '-')}]"
            for r in learned_rules
        ]
        learned_rules_str = "\n".join(learned_rules_lines)
    else:
        learned_rules_str = "(Belum ada aturan tambahan dari obrolan)."

    # 3. Penyesuaian Instruksi Berdasarkan Mode
    mode_instruction = ""
    if mode == "latihan":
        mode_instruction = """
[MODE PERCAKAPAN: LATIHAN & INTERACTIVE TESTING]
Tugas Utama Anda:
1. Berperan sebagai Mentor / Guru Bahasa Dayak Ma'anyan yang ramah, teliti, dan menguatkan.
2. Buatkan kalimat latihan, tebak arti kata, terjemahan dua arah (Ma'anyan <-> Indonesia), atau kuis situasi (misal: kondisi kelaparan, aktivitas di lewu/ume/hungei).
3. Jika pengguna menjawab:
   - Evaluasi apakah jawabannya tepat atau keliru.
   - Jelaskan tata bahasa yang benar jika ada kesalahan secara suportif.
   - Berikan apresiasi atau pujian dalam bahasa Ma'anyan (misal: "Kena tatu'u!" = Benar sekali!).
   - Berikan soal latihan atau tantangan berikutnya.
4. Formatkan pesan dengan rapi menggunakan Markdown agar mudah dibaca di Telegram.
"""
    else:
        mode_instruction = """
[MODE PERCAKAPAN: CHAT & ROLEPLAY PENUTUR ASLI]
Tugas Utama Anda:
1. Berperan sebagai warga atau sahabat asli Dayak Ma'anyan (Kalimantan Tengah / Barito Timur) yang ramah, santun, dan luwes.
2. Selalu prioritaskan menjawab dalam kalimat bahasa Dayak Ma'anyan yang alami, menggunakan kosakata dan aturan yang tercatat di bawah.
3. Di bawah kalimat bahasa Ma'anyan, sertakan terjemahan / glosarium bahasa Indonesia dalam tanda kutip atau kurung agar lawan bicara yang sedang belajar bisa mengerti konteksnya.
4. Gunakan partikel khas dan kata penegas seperti 'tatu'u' (banget), 'daya/dagana' (karena), 'kude' (tetapi), 'nelang' (sambil), 'ta'ati' (sekarang).
5. Ingat hirarki rasa lapar: 'layah' (lapar biasa), 'kalauan' (sangat lapar), 'hinut' (lapar lemas mau pingsan).
6. Tanyakan nama atau kabari mereka jika relevan (misal: "Hie ngaran nu?").
"""

    # 4. Merangkai System Instruction Utuh
    system_prompt = f"""
Anda adalah Model Bahasa & Asisten AI Cerdas Bahasa Dayak Ma'anyan (Kalimantan Tengah, Indonesia).
Anda memiliki kecakapan linguistik tinggi, memahami ragam dialek, tata bahasa, dan budaya suku Dayak Ma'anyan.

{mode_instruction}

=== KNOWLEDGE BASE INTI (PENGETAHUAN AWAL) ===
[Kosakata Dasar & Ungkapan Autentik]:
{core_vocab_str}

[Aturan Tata Bahasa Inti]:
{core_rules_str}

=== DYNAMIC MEMORY (PENGETAHUAN TAMBAHAN DARI DATABASE SQLITE) ===
Berikut adalah kosakata baru dan koreksi yang berhasil Anda pelajari langsung dari pengguna di Telegram sejauh ini:
{learned_vocab_str}

[Aturan Tambahan yang Telah Dipelajari]:
{learned_rules_str}

=== PEDOMAN PENTING ===
- Selalu patuhi pengetahuan di atas sebagai standar kebenaran utama.
- Jika pengguna mengoreksi atau mengajarkan istilah baru di tengah percakapan, tanggapi dengan rasa terima kasih dan adaptif terhadap koreksi tersebut.
- Tetap bersahabat, sopan, dan lestarikan keaslian bahasa Dayak Ma'anyan.
"""
    return system_prompt.strip()

def detect_and_learn_from_message(user_message: str, contributor: str = "Telegram User") -> Optional[Dict[str, Any]]:
    """
    DYNAMIC AUTO-LEARNING SYSTEM:
    Menganalisis pesan pengguna menggunakan Gemini untuk mendeteksi apakah pesan tersebut
    berisi pengajaran kata baru, koreksi arti, atau penjelasan tata bahasa Dayak Ma'anyan.
    Jika ada, otomatis menyimpannya ke database SQLite.
    """
    # Filter cepat untuk efisiensi token: jika pesan terlalu singkat atau tidak mengandung indikasi koreksi/definisi
    trigger_keywords = [
        "artinya", "artian", "artinyo", "maksudnya", "harusnya", "salah", "koreksi",
        "beda", "bahasa ma'anyan", "maanyan", "kata", "bukan", "adalah", "disebut",
        "kalau", "artie", "ngaran", "kosa kata", "kosakata", "tau gak", "tahu gak"
    ]
    has_trigger = any(kw in user_message.lower() for kw in trigger_keywords)
    
    # Jika tidak ada trigger eksplisit dan panjangnya pendek, skip ekstraksi agar hemat kuota
    if not has_trigger and len(user_message.split()) < 3:
        return None

    client = get_genai_client()
    
    detection_prompt = f"""
Tugasmu adalah menganalisis pesan pengguna Telegram berikut dan mendeteksi apakah pengguna sedang MENGAJARKAN kosakata baru, MENGOREKSI arti/tata bahasa, atau MEMBERIKAN definisi istilah dalam Bahasa Dayak Ma'anyan.

Pesan Pengguna:
\"\"\"{user_message}\"\"\"

Kembalikan respon HANYA dalam format JSON valid dengan struktur:
{{
  "is_teaching": true / false,
  "learned_items": [
    {{
      "term_maanyan": "kata dalam bahasa maanyan",
      "meaning_indonesian": "arti dalam bahasa indonesia",
      "category": "kategori kata (misal: Kosakata Dasar, Tunjuk & Objek, Hewan, Sifat, Waktu, Makanan, dsb)",
      "example_sentence": "contoh kalimat jika ada atau kosongkan"
    }}
  ],
  "learned_rule": {{
    "title": "judul aturan ringkas jika ada",
    "rule_description": "penjelasan aturan tata bahasa atau beda makna jika ada",
    "example": "contoh penggunaan jika ada"
  }},
  "detected_summary": "penjelasan ringkas apa yang dipelajari"
}}

Aturan:
- Jika pengguna HANYA mengobrol biasa, bertanya, atau tidak mengajarkan/mengoreksi bahasa Ma'anyan, set "is_teaching": false dan "learned_items": [].
- Jangan halusinasi kata yang tidak diajarkan oleh pengguna.
"""

    try:
        response = client.models.generate_content(
            model=DEFAULT_MODEL,
            contents=detection_prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1,
            )
        )
        
        raw_text = response.text.strip()
        data = json.loads(raw_text)
        
        if data.get("is_teaching"):
            saved_items = []
            # Simpan kosakata ke SQLite
            for item in data.get("learned_items", []):
                term = item.get("term_maanyan", "").strip()
                meaning = item.get("meaning_indonesian", "").strip()
                category = item.get("category", "Umum").strip()
                example = item.get("example_sentence", "").strip()
                
                if term and meaning:
                    success = save_learned_vocab(
                        term=term,
                        meaning=meaning,
                        category=category,
                        example=example,
                        contributor=contributor
                    )
                    if success:
                        saved_items.append(f"{term} ({meaning})")

            # Simpan aturan tata bahasa jika ada
            rule_data = data.get("learned_rule")
            if rule_data and rule_data.get("title") and rule_data.get("rule_description"):
                save_learned_rule(
                    title=rule_data.get("title"),
                    description=rule_data.get("rule_description"),
                    example=rule_data.get("example", ""),
                    contributor=contributor
                )

            if saved_items or (rule_data and rule_data.get("title")):
                return {
                    "saved_items": saved_items,
                    "summary": data.get("detected_summary", "Kosakata / aturan baru tersimpan"),
                    "rule": rule_data if rule_data and rule_data.get("title") else None
                }
                
        return None

    except Exception as e:
        logger.warning(f"Gagal mendeteksi auto-learning: {e}")
        return None

def generate_maanyan_response(
    user_message: str,
    user_id: int,
    mode: str = "chat",
    chat_history: Optional[List[Dict[str, str]]] = None
) -> str:
    """
    Menghasilkan balasan AI yang cerdas dan kaya konteks Dayak Ma'anyan
    menggunakan Dynamic System Instruction terbaru.
    """
    client = get_genai_client()
    system_instruction = build_dynamic_system_instruction(mode=mode)

    # Format riwayat percakapan untuk konteks obrolan
    contents = []
    if chat_history:
        for msg in chat_history[-6:]:  # ambil 6 percakapan terakhir
            role = "user" if msg.get("role") == "user" else "model"
            contents.append(types.Content(
                role=role,
                parts=[types.Part.from_text(text=msg.get("text", ""))]
            ))
            
    # Tambahkan pesan pengguna saat ini
    contents.append(types.Content(
        role="user",
        parts=[types.Part.from_text(text=user_message)]
    ))

    try:
        response = client.models.generate_content(
            model=DEFAULT_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7 if mode == "chat" else 0.5,
            )
        )
        return response.text.strip()
    except Exception as e:
        logger.error(f"Error calling Gemini: {e}")
        return f"Maaf, terjadi kendala saat memproses balasan: {str(e)}"
