"""
knowledge_base.py
Knowledge Base Inti (Core Knowledge Base) Bahasa Dayak Ma'anyan
Berisi aturan tata bahasa, kosakata baku & autentik, serta pedoman dialek Dayak Ma'anyan (Kalimantan Tengah / Barito Timur).
"""

CORE_VOCABULARY = [
    # Kosakata Dasar
    {"term": "nguta / kuman", "meaning": "makan", "category": "Kosakata Dasar", "notes": "kuman dan nguta sering digunakan bergantian untuk aktivitas makan"},
    {"term": "nahi", "meaning": "nasi", "category": "Kosakata Dasar", "notes": "makanan pokok"},
    {"term": "waday", "meaning": "kue / kudapan", "category": "Kosakata Dasar", "notes": "segala jenis kue tradisional atau cemilan"},
    {"term": "ranu", "meaning": "air", "category": "Kosakata Dasar", "notes": "air minum atau air umum"},
    {"term": "hungei", "meaning": "sungai", "category": "Kosakata Dasar", "notes": "sungai atau aliran air"},
    {"term": "ume", "meaning": "ladang", "category": "Kosakata Dasar", "notes": "ladang padi atau kebun tradisional"},
    {"term": "lewu", "meaning": "rumah", "category": "Kosakata Dasar", "notes": "tempat tinggal"},
    {"term": "tumpuk", "meaning": "kampung / desa", "category": "Kosakata Dasar", "notes": "desa atau permukiman warga"},

    # Tunjuk & Objek
    {"term": "yiti", "meaning": "ini", "category": "Tunjuk & Objek", "notes": "kata tunjuk dekat"},
    {"term": "yina", "meaning": "itu", "category": "Tunjuk & Objek", "notes": "kata tunjuk jauh"},
    {"term": "yiru / iru", "meaning": "itu (merujuk pada objek/hal tertentu)", "category": "Tunjuk & Objek", "notes": "kata tunjuk objek yang sedang dibahas"},
    {"term": "iya", "meaning": "anak", "category": "Tunjuk & Objek", "notes": "anak kandung atau anak kecil"},
    {"term": "ulun", "meaning": "orang", "category": "Tunjuk & Objek", "notes": "manusia atau seseorang"},

    # Aktivitas & Waktu
    {"term": "bagawi", "meaning": "bekerja", "category": "Aktivitas & Waktu", "notes": "melakukan pekerjaan"},
    {"term": "naragu", "meaning": "memperbaiki", "category": "Aktivitas & Waktu", "notes": "membenahi barang rusak atau keadaan"},
    {"term": "mangang", "meaning": "memanggang", "category": "Aktivitas & Waktu", "notes": "memanggang makanan di atas api"},
    {"term": "mandre", "meaning": "tidur", "category": "Aktivitas & Waktu", "notes": "istirahat tidur"},
    {"term": "ta'ati", "meaning": "sekarang / saat ini", "category": "Aktivitas & Waktu", "notes": "keterangan waktu sekarang"},
    {"term": "iengen / kamalem", "meaning": "malam / kemalaman", "category": "Aktivitas & Waktu", "notes": "waktu malam hari"},
    {"term": "kariwe die", "meaning": "nanti sore", "category": "Aktivitas & Waktu", "notes": "keterangan waktu sore hari nanti"},

    # Tingkat Kelaparan (Penting & Khas Ma'anyan)
    {"term": "layah", "meaning": "lapar (tingkat biasa)", "category": "Tingkat Kelaparan", "notes": "rasa lapar standar saat tiba waktu makan"},
    {"term": "kalauan", "meaning": "sangat lapar", "category": "Tingkat Kelaparan", "notes": "lapar berat karena terlambat makan"},
    {"term": "hinut", "meaning": "lapar banget mau pingsan / lemas tak berdaya", "category": "Tingkat Kelaparan", "notes": "tingkat lapar ekstrem hingga gemetar/lemas"},

    # Tata Bahasa & Kata Hubung
    {"term": "daya / dagana", "meaning": "karena / sebab", "category": "Kata Hubung & Partikel", "notes": "konjungsi sebab-akibat"},
    {"term": "kude", "meaning": "tapi / tetapi", "category": "Kata Hubung & Partikel", "notes": "konjungsi pertentangan"},
    {"term": "dadijari", "meaning": "jadi / makanya / oleh karena itu", "category": "Kata Hubung & Partikel", "notes": "konjungsi kesimpulan"},
    {"term": "ekat", "meaning": "cuma / hanya", "category": "Kata Hubung & Partikel", "notes": "pembatasan"},
    {"term": "tatu'u", "meaning": "sangat / banget / sungguh", "category": "Kata Hubung & Partikel", "notes": "penegas tingkat intensitas, contoh: layah tatu'u (lapar banget)"},
    {"term": "nelang", "meaning": "sambil / seraya", "category": "Kata Hubung & Partikel", "notes": "melakukan dua aktivitas bersamaan"},
    {"term": "baya", "meaning": "dan / serta", "category": "Kata Hubung & Partikel", "notes": "penghubung penambahan"},
    {"term": "sindrah", "meaning": "bersama / dengan", "category": "Kata Hubung & Partikel", "notes": "kebersamaan"},
    {"term": "hayu", "meaning": "mari / ayo", "category": "Kata Hubung & Partikel", "notes": "ajakan"},
    {"term": "puang ka'itung", "meaning": "lupa / tidak teringat", "category": "Ungkapan Khas", "notes": "lupa ingatan akan sesuatu"},
    {"term": "bapaner", "meaning": "bicara / mengajar / bercakap", "category": "Aktivitas & Waktu", "notes": "berbicara dalam bahasa Ma'anyan"},
    {"term": "luput", "meaning": "selesai / usai", "category": "Kata Kerja / Kondisi", "notes": "pekerjaan atau kejadian telah usai"},

    # Kata Ganti Orang (Pronomina)
    {"term": "aku", "meaning": "aku / saya", "category": "Kata Ganti", "notes": "orang pertama tunggal"},
    {"term": "hanyu", "meaning": "kamu / engkau", "category": "Kata Ganti", "notes": "orang kedua tunggal"},
    {"term": "hanye", "meaning": "dia / ia", "category": "Kata Ganti", "notes": "orang ketiga tunggal"},
    {"term": "kami / ite", "meaning": "kami / kita", "category": "Kata Ganti", "notes": "orang pertama jamak"},
    {"term": "ere / kere", "meaning": "mereka", "category": "Kata Ganti", "notes": "orang ketiga jamak"},

    # Kalimat Penting & Frasa Tanya
    {"term": "Hie ngaran nu?", "meaning": "Siapa namamu?", "category": "Frasa Tanya", "notes": "pertanyaan standar untuk menanyakan nama seseorang"}
]

CORE_GRAMMAR_RULES = [
    "Struktur kalimat umumnya S-P-O atau P-S (predikat dikedepankan untuk penekanan).",
    "Penegas 'tatu'u' (sangat) selalu diletakkan setelah kata sifat, contoh: 'layah tatu'u' (sangat lapar), 'ramai tatu'u' (sangat ramai).",
    "Tingkat kelaparan terbagi 3 jenjang hierarkis: layah (biasa) -> kalauan (sangat lapar) -> hinut (lemas mau pingsan).",
    "Kata tunjuk letak: 'yiti' (ini), 'yina' (itu), sedangkan 'yiru/iru' khusus merujuk objek atau perkara yang telah disebut.",
    "Kata 'puang' berarti tidak/bukan. 'Puang ka'itung' adalah idiom khas berarti lupa.",
    "Konjungsi 'nelang' (sambil) menghubungkan dua klausa aktivitas simultan, contoh: 'kuman nelang bapaner' (makan sambil berbicara).",
    "Sapaan kehormatan khas Dayak Ma'anyan menggunakan 'Tabe' atau 'Salam hangat'."
]

def format_core_vocab_text() -> str:
    """Format daftar kosakata inti ke string untuk System Instruction."""
    lines = []
    for item in CORE_VOCABULARY:
        lines.append(f"- {item['term']} = {item['meaning']} ({item['category']}) [{item.get('notes', '')}]")
    return "\n".join(lines)

def format_core_rules_text() -> str:
    """Format aturan tata bahasa inti ke string untuk System Instruction."""
    return "\n".join([f"{i+1}. {rule}" for i, rule in enumerate(CORE_GRAMMAR_RULES)])
