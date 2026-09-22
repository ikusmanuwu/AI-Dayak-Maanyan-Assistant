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

# Inisialisasi otomatis saat modul diimpor
init_db()
