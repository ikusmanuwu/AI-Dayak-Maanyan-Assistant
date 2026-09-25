"""
database.py
Modul Manajemen SQLite3 untuk Penyimpanan Ingatan & Pembelajaran Rekursif
Menyimpan kosakata baru, aturan tata bahasa yang diajarkan pengguna, dan preferensi sesi.
"""

import sqlite3
import os
from typing import List, Dict, Any, Optional
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "maanyan_memory.db")

def get_connection() -> sqlite3.Connection:
    """Membuka koneksi ke SQLite database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Inisialisasi tabel database jika belum ada."""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Tabel kosakata yang dipelajari otomatis dari percakapan
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS learned_vocab (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                term_maanyan TEXT NOT NULL UNIQUE,
                meaning_indonesian TEXT NOT NULL,
                category TEXT DEFAULT 'Umum',
                example_sentence TEXT,
                confidence REAL DEFAULT 1.0,
                contributor TEXT DEFAULT 'Telegram User',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Tabel aturan tata bahasa baru
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS learned_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                rule_description TEXT NOT NULL,
                example TEXT,
                contributor TEXT DEFAULT 'Telegram User',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Tabel transaksi keuangan (Pemasukan & Pengeluaran)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                username TEXT,
                type TEXT NOT NULL, -- 'income' atau 'expense'
                amount REAL NOT NULL,
                category TEXT NOT NULL,
                notes TEXT,
                transaction_date DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Tabel batas anggaran per kategori
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS budget_limits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL UNIQUE,
                monthly_limit REAL NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Inisialisasi limit anggaran default keluarga jika masih kosong
        cursor.execute("SELECT COUNT(*) as cnt FROM budget_limits")
        if cursor.fetchone()["cnt"] == 0:
            default_limits = [
                ("Apartemen", 6500000),
                ("Makan & Belanja", 5000000),
                ("Transport & Bensin", 2000000),
                ("Tagihan & Listrik", 1500000),
                ("Hiburan & Liburan", 2000000),
                ("Keluarga & Orang Tua", 2500000),
                ("Lain-lain", 2300000)
            ]
            for cat, lim in default_limits:
                cursor.execute("INSERT OR IGNORE INTO budget_limits (category, monthly_limit) VALUES (?, ?)", (cat, lim))

        # Tabel sesi pengguna (Mode Percakapan & Status Latihan)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_sessions (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                current_mode TEXT DEFAULT 'chat',
                score INTEGER DEFAULT 0,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.commit()

def save_learned_vocab(term: str, meaning: str, category: str = "Umum", example: str = "", contributor: str = "User") -> bool:
    """Menyimpan atau memperbarui kosakata hasil koreksi/pengajaran pengguna."""
    clean_term = term.strip().lower()
    clean_meaning = meaning.strip().lower()
    
    if not clean_term or not clean_meaning:
        return False
        
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO learned_vocab (term_maanyan, meaning_indonesian, category, example_sentence, contributor, created_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(term_maanyan) DO UPDATE SET
                meaning_indonesian = excluded.meaning_indonesian,
                category = excluded.category,
                example_sentence = CASE WHEN excluded.example_sentence != '' THEN excluded.example_sentence ELSE learned_vocab.example_sentence END,
                created_at = CURRENT_TIMESTAMP
        """, (clean_term, clean_meaning, category, example, contributor))
        conn.commit()
        return True

def save_learned_rule(title: str, description: str, example: str = "", contributor: str = "User") -> bool:
    """Menyimpan aturan tata bahasa baru yang diajarkan."""
    if not title or not description:
        return False
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO learned_rules (title, rule_description, example, contributor, created_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (title.strip(), description.strip(), example.strip(), contributor))
        conn.commit()
        return True

def get_all_learned_vocab() -> List[Dict[str, Any]]:
    """Mengambil semua kosakata hasil auto-learning dari database."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM learned_vocab ORDER BY created_at DESC")
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def get_all_learned_rules() -> List[Dict[str, Any]]:
    """Mengambil semua aturan tata bahasa yang telah dipelajari."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM learned_rules ORDER BY created_at DESC")
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def search_vocab(keyword: str) -> List[Dict[str, Any]]:
    """Mencari kosakata di database hasil pembelajaran."""
    pattern = f"%{keyword.strip().lower()}%"
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM learned_vocab
            WHERE term_maanyan LIKE ? OR meaning_indonesian LIKE ?
            ORDER BY term_maanyan ASC
        """, (pattern, pattern))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def get_user_mode(user_id: int) -> str:
    """Mengambil mode percakapan pengguna saat ini ('chat' atau 'latihan')."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT current_mode FROM user_sessions WHERE user_id = ?", (user_id,))
        row = cursor.fetchone()
        if row:
            return row["current_mode"]
        return "chat"

def set_user_mode(user_id: int, username: str, mode: str):
    """Mengubah mode percakapan pengguna ('chat' atau 'latihan')."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO user_sessions (user_id, username, current_mode, last_active)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                username = excluded.username,
                current_mode = excluded.current_mode,
                last_active = CURRENT_TIMESTAMP
        """, (user_id, username or "Anonymous", mode))
        conn.commit()

def increment_user_score(user_id: int, points: int = 10):
    """Menambah poin nilai latihan pengguna."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE user_sessions
            SET score = score + ?
            WHERE user_id = ?
        """, (points, user_id))
        conn.commit()

def get_stats() -> Dict[str, Any]:
    """Mendapatkan statistik ringkas memori database."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as total_vocab FROM learned_vocab")
        total_vocab = cursor.fetchone()["total_vocab"]
        
        cursor.execute("SELECT COUNT(*) as total_rules FROM learned_rules")
        total_rules = cursor.fetchone()["total_rules"]
        
        cursor.execute("SELECT COUNT(*) as total_users FROM user_sessions")
        total_users = cursor.fetchone()["total_users"]
        
        return {
            "total_learned_vocab": total_vocab,
            "total_learned_rules": total_rules,
            "total_users": total_users,
        }

def reset_all_learned():
    """Mereset data hasil pembelajaran (untuk debugging/pengujian ulang)."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM learned_vocab")
        cursor.execute("DELETE FROM learned_rules")
        conn.commit()

def record_transaction(
    user_id: int,
    username: str,
    trx_type: str,
    amount: float,
    category: str,
    notes: str = "",
    transaction_date: Optional[str] = None
) -> int:
    """Mencatat transaksi pemasukan / pengeluaran ke database."""
    if not transaction_date:
        transaction_date = datetime.now().strftime("%Y-%m-%d")
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO transactions (user_id, username, type, amount, category, notes, transaction_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (user_id, username, trx_type.lower(), amount, category.strip(), notes.strip(), transaction_date))
        conn.commit()
        return cursor.lastrowid

def get_active_salary_budget_period() -> Dict[str, Any]:
    """
    Menentukan rentang periode anggaran aktif secara dinamis berdasarkan 
    transaksi GAJIAN terakhir yang tercatat di database.
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # 1. Cari transaksi gaji terakhir
        cursor.execute("""
            SELECT transaction_date, amount, notes
            FROM transactions
            WHERE type = 'income'
              AND (LOWER(category) LIKE '%gaji%' OR LOWER(notes) LIKE '%gaji%')
            ORDER BY transaction_date DESC, id DESC
            LIMIT 1
        """)
        row = cursor.fetchone()
        
        today = datetime.now().date()
        
        if row:
            trx_str = row["transaction_date"]
            start_date = datetime.strptime(trx_str, "%Y-%m-%d").date() if isinstance(trx_str, str) else trx_str
        else:
            # Jika belum ada catatan gaji, gunakan awal bulan ini
            start_date = datetime(today.year, today.month, 1).date()

        nama_bulan = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
                      "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
        
        # Jika gajian diterima mulai tanggal 20 ke atas, alokasikan untuk label nama bulan berikutnya
        if start_date.day >= 20:
            next_m = 1 if start_date.month == 12 else start_date.month + 1
            year_val = start_date.year + 1 if start_date.month == 12 else start_date.year
            period_name = f"{nama_bulan[next_m]} {year_val}"
            # Estimasi rentang s.d. tanggal sehari sebelum gajian bulan depan
            end_date = datetime(year_val, next_m, start_date.day - 1).date() if start_date.day > 1 else start_date
        else:
            period_name = f"{nama_bulan[start_date.month]} {start_date.year}"
            end_date = start_date

        return {
            "start_date": start_date, # Hari H gajian diterima (Langsung aktif!)
            "end_date": end_date,
            "period_name": period_name,
            "label": f"Periode {period_name} (Mulai {start_date.strftime('%d %b %Y')} - Gajian Selanjutnya)"
        }

def get_budget_status_summary() -> Dict[str, Any]:
    """Mengambil ringkasan realisasi anggaran periode aktif vs limit kategori."""
    period_info = get_active_salary_budget_period()
    start_date_str = period_info["start_date"].strftime("%Y-%m-%d")

    with get_connection() as conn:
        cursor = conn.cursor()

        # Ambil semua limit kategori
        cursor.execute("SELECT category, monthly_limit FROM budget_limits ORDER BY monthly_limit DESC")
        limits = {r["category"]: float(r["monthly_limit"]) for r in cursor.fetchall()}
        total_limit = sum(limits.values())

        # Ambil total pengeluaran per kategori sejak start_date
        cursor.execute("""
            SELECT category, SUM(amount) as total_spent, COUNT(id) as trx_count
            FROM transactions
            WHERE type = 'expense'
              AND transaction_date >= ?
            GROUP BY category
        """, (start_date_str,))
        spent_rows = cursor.fetchall()

        spent_map = {}
        total_spent = 0.0
        total_trx = 0
        for r in spent_rows:
            cat = r["category"]
            amt = float(r["total_spent"])
            cnt = int(r["trx_count"])
            spent_map[cat] = amt
            total_spent += amt
            total_trx += cnt

        category_details = []
        for cat, limit in limits.items():
            spent = spent_map.get(cat, 0.0)
            pct = (spent / limit * 100) if limit > 0 else 0
            remaining = limit - spent
            category_details.append({
                "category": cat,
                "spent": spent,
                "limit": limit,
                "percentage": pct,
                "remaining": remaining
            })

        remaining_total = total_limit - total_spent
        overall_pct = (total_spent / total_limit * 100) if total_limit > 0 else 0

        return {
            "period_info": period_info,
            "total_spent": total_spent,
            "total_limit": total_limit,
            "remaining_total": remaining_total,
            "overall_percentage": overall_pct,
            "total_trx": total_trx,
            "category_details": category_details
        }

# Inisialisasi otomatis saat modul diimpor
init_db()
