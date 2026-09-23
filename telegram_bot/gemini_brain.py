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

# Konfigurasi Model Cascade Handal & Stabil
DEFAULT_MODELS = [
    os.getenv("GEMINI_MODEL", "gemini-3.5-flash"),
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-flash-latest"
]

# Cache memori lokal di Python (TTL 15 menit)
import time
_response_cache: Dict[str, Dict[str, Any]] = {}

def try_local_dictionary_match(text: str) -> Optional[str]:
    """
    Tier-1 Fast Matcher: Menjawab pertanyaan kamus satu kata & salam secara lokal tanpa memakan token LLM (0 Token!).
    """
    clean = text.strip().lower().replace("?", "").replace("!", "").replace(".", "")
    
    # 1. Salam & Sapaan Standar
    if clean in ["selamat pagi", "pagi", "kaiyat"]:
        return "Kaiyat! (Selamat pagi!) Tabe salamat, inun kabar nu ta'ati? (Bagaimana kabarmu sekarang?)"
    if clean in ["selamat siang", "selamat sore", "siang", "sore", "kamerer"]:
        return "Kamerer! (Selamat siang/sore!) Tabe salamat, inun luan nu dangan aku? (Ada urusan apa denganku?)"
    if clean in ["selamat malam", "malam", "kalamarian"]:
        return "Kalamarian! (Selamat malam!) Tabe salamat, haut kuman kalamarian kah? (Sudah makan malamkah?)"
    if clean in ["apa kabar", "inun kabar", "inun habar", "kabar"]:
        return "Kabar ma'at! (Kabar baik!). Aku yiti asisten AI bahasa Dayak Ma'anyan. Hanyu dainun kabar nu? (Kamu bagaimana kabarmu?)"
    if clean in ["terima kasih", "makasih", "tarima kasih"]:
        return "Tarima kasih ganta! (Terima kasih kembali / Sama-sama!). Sanang gina'u nulung hanyu. (Senang rasanya membantu kamu.)"
    if clean in ["siapa namamu", "hie ngaran nu", "siapa nama kamu"]:
        return "Ngaran ku asisten AI Dayak Ma'anyan. Aku nulung hanyu bapaner nelang balajar basa ite. (Namaku asisten AI Dayak Ma'anyan. Aku membantumu berbicara dan belajar bahasa kita.)"

    # 2. Pertanyaan Kamus Kosakata
    import re
    target_word = ""
    direction = "both"

    m_arti = re.match(r"^(?:apa\s+)?(?:artinya|arti|artian|makna(?:nya)?)\s+(?:dari\s+|kata\s+)?([a-zA-Z0-9'`\-~]+)$", clean)
    m_kata_arti = re.match(r"^([a-zA-Z0-9'`\-~]+)\s+(?:artinya|artian|maknanya)\s*(?:apa|inun)?$", clean)
    m_maanyan = re.match(r"^(?:apa\s+)?(?:bahasa\s+maanyan|bahasa\s+ma'anyan|basa\s+maanyan|bahasa\s+dayak)(?:nya|\s+dari)?\s+([a-zA-Z0-9'`\-~]+)(?:\s+apa)?$", clean)
    m_indo = re.match(r"^(?:apa\s+)?(?:bahasa\s+indonesia|bahasa\s+indo)(?:nya|\s+dari)?\s+([a-zA-Z0-9'`\-~]+)(?:\s+apa)?$", clean)

    if m_arti:
        target_word = m_arti.group(1).strip()
    elif m_kata_arti:
        target_word = m_kata_arti.group(1).strip()
    elif m_maanyan:
        target_word = m_maanyan.group(1).strip()
        direction = "indo_to_maanyan"
    elif m_indo:
        target_word = m_indo.group(1).strip()
        direction = "maanyan_to_indo"

    if target_word and len(target_word) >= 2:
        w_lower = target_word.lower()
        learned = get_all_learned_vocab()
        all_vocab = learned + CORE_VOCABULARY

        if direction in ["maanyan_to_indo", "both"]:
            for v in all_vocab:
                term = v.get("term_maanyan") or v.get("term", "")
                if term.lower() == w_lower or w_lower in [t.strip() for t in term.lower().split("/")]:
                    meaning = v.get("meaning_indonesian") or v.get("meaning", "")
                    cat = v.get("category", "Kosakata")
                    ex = v.get("example_sentence") or v.get("example") or ""
                    res = f"*{term}* hang bahasa Indonesia artinya **{meaning}**.\n\n📖 **Kategori:** {cat}"
                    if ex:
                        res += f"\n📝 **Contoh:** {ex}"
                    return res

        if direction in ["indo_to_maanyan", "both"]:
            for v in all_vocab:
                meaning = v.get("meaning_indonesian") or v.get("meaning", "")
                if meaning.lower() == w_lower or w_lower in [m.strip() for m in meaning.lower().split("/")]:
                    term = v.get("term_maanyan") or v.get("term", "")
                    cat = v.get("category", "Kosakata")
                    ex = v.get("example_sentence") or v.get("example") or ""
                    res = f"Bahasa Dayak Ma'anyan untuk **{meaning}** adalah **{term}**.\n\n📖 **Kategori:** {cat}"
                    if ex:
                        res += f"\n📝 **Contoh:** {ex}"
                    return res

    return None

def get_genai_client() -> genai.Client:
    """Menginisialisasi client Google GenAI dengan API Key."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY belum disetel pada environment / file .env!")
    return genai.Client(api_key=api_key)

def build_dynamic_system_instruction(mode: str = "chat", user_message: str = "") -> str:
    """
    Membangun System Instruction dinamis secara realtime dengan RAG ringan agar hemat token.
    """
    # Filter kata relevan dari pesan pengguna
    words = [w for w in user_message.lower().split() if len(w) > 2]
    
    # 1. Pilih kosakata inti yang paling relevan (Smart RAG)
    scored = []
    for item in CORE_VOCABULARY:
        score = 0
        term_l = (item.get("term") or item.get("term_maanyan", "")).lower()
        mean_l = (item.get("meaning") or item.get("meaning_indonesian", "")).lower()
        for w in words:
            if w in term_l: score += 3
            if w in mean_l: score += 2
        scored.append((score, item))
        
    scored.sort(key=lambda x: x[0], reverse=True)
    top_items = [s[1] for s in scored if s[0] > 0][:35]
    fallback_items = CORE_VOCABULARY[:30]
    chosen_vocab = top_items + [v for v in fallback_items if v not in top_items]
    chosen_vocab = chosen_vocab[:45]

    core_vocab_lines = [
        f"- {v.get('term') or v.get('term_maanyan')} = {v.get('meaning') or v.get('meaning_indonesian')} ({v.get('category', 'Umum')})"
        for v in chosen_vocab
    ]
    core_vocab_str = "\n".join(core_vocab_lines)
    core_rules_str = format_core_rules_text()

    # 2. Kosakata & Aturan Tambahan dari SQLite (Maks 15)
    learned_vocab = get_all_learned_vocab()[:15]
    learned_rules = get_all_learned_rules()[:5]

    learned_vocab_str = ""
    if learned_vocab:
        learned_vocab_lines = [
            f"- {v['term_maanyan']} = {v['meaning_indonesian']} ({v['category']})"
            for v in learned_vocab
        ]
        learned_vocab_str = "\n".join(learned_vocab_lines)
    else:
        learned_vocab_str = "(Belum ada kosakata tambahan yang dipelajari)."

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
    menggunakan Dynamic System Instruction terbaru dengan optimasi token.
    """
    # 1. OPTIMASI TIER-1: Coba pencocokan kamus lokal & salam instan (0 Token!)
    if mode == "chat":
        local_match = try_local_dictionary_match(user_message)
        if local_match:
            return local_match

    # 2. OPTIMASI TIER-2: Cek Response Cache untuk pertanyaan yang sama (0 Token!)
    cache_key = f"{mode}:{user_message.strip().lower()}"
    if cache_key in _response_cache:
        item = _response_cache[cache_key]
        if time.time() - item["time"] < 900:  # 15 menit
            return item["text"]

    client = get_genai_client()
    system_instruction = build_dynamic_system_instruction(mode=mode, user_message=user_message)

    # Format & compact riwayat percakapan (simpan 3-4 terakhir, pangkas teks panjang)
    contents = []
    if chat_history:
        for msg in chat_history[-4:]:
            role = "user" if msg.get("role") == "user" else "model"
            text = (msg.get("text") or "").strip()
            if role != "user" and len(text) > 250:
                text = text[:250] + "..."
            contents.append(types.Content(
                role=role,
                parts=[types.Part.from_text(text=text)]
            ))
            
    # Tambahkan pesan pengguna saat ini
    contents.append(types.Content(
        role="user",
        parts=[types.Part.from_text(text=user_message)]
    ))

    is_story = any(k in user_message.lower() for k in ["cerita", "dongeng", "cinderella", "palanuk"])
    max_tokens = 800 if is_story else (500 if mode == "chat" else 350)

    last_error = None
    for model_name in DEFAULT_MODELS:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.7 if mode == "chat" else 0.4,
                    max_output_tokens=max_tokens
                )
            )
            result_text = response.text.strip()
            # Simpan ke cache jika bukan pesan error
            if result_text and not result_text.startswith("⚠️"):
                _response_cache[cache_key] = {"text": result_text, "time": time.time()}
                if len(_response_cache) > 100:
                    _response_cache.pop(next(iter(_response_cache)))
            return result_text
        except Exception as e:
            last_error = e
            logger.warning(f"Model {model_name} gagal: {e}. Mencoba model cadangan...")

    logger.error(f"Semua model Gemini gagal: {last_error}")
    return f"Maaf, server AI sedang mengalami jeda kuota/antrean tinggi. Mohon coba lagi dalam beberapa detik ya! (Error: {str(last_error)})"
