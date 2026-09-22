import { createClient, Client } from "@libsql/client";

let client: Client | null = null;
let isTursoConnected = false;

export function getTursoConfig(): { url: string; authToken: string; isConfigured: boolean } {
  const url = process.env.TURSO_DATABASE_URL || process.env.TURSO_URL || process.env.LIBSQL_URL || "";
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN || process.env.LIBSQL_AUTH_TOKEN || "";
  return {
    url,
    authToken,
    isConfigured: Boolean(url && authToken)
  };
}

export function getTursoClient(): Client | null {
  if (client) return client;

  const { url, authToken, isConfigured } = getTursoConfig();
  if (!isConfigured) {
    return null;
  }

  try {
    client = createClient({
      url,
      authToken
    });
    isTursoConnected = true;
    return client;
  } catch (error) {
    console.error("[Turso] Failed to initialize Turso client:", error);
    return null;
  }
}

export async function initTursoDatabase(): Promise<{ success: boolean; message: string }> {
  const turso = getTursoClient();
  if (!turso) {
    const config = getTursoConfig();
    if (!config.url) {
      return { success: false, message: "TURSO_DATABASE_URL belum dikonfigurasi di Environment Variables." };
    }
    if (!config.authToken) {
      return { success: false, message: "TURSO_AUTH_TOKEN belum dikonfigurasi di Environment Variables." };
    }
    return { success: false, message: "Gagal menghubungkan ke Turso Database." };
  }

  try {
    console.log("[Turso] Memulai inisialisasi tabel di Turso database...");

    // 1. Tabel Kosakata yang Dipelajari (learned_vocab)
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS learned_vocab (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term_maanyan TEXT NOT NULL UNIQUE,
        meaning_indonesian TEXT NOT NULL,
        category TEXT DEFAULT 'Umum',
        example_sentence TEXT,
        contributor TEXT DEFAULT 'Sistem',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Tabel Aturan Tata Bahasa (learned_rules)
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS learned_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        rule_description TEXT NOT NULL,
        example TEXT,
        contributor TEXT DEFAULT 'Sistem',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Tabel Sesi Pengguna Telegram (user_sessions)
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        user_id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        current_mode TEXT DEFAULT 'chat',
        score INTEGER DEFAULT 0,
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Cek apakah tabel learned_vocab sudah ada isinya
    const existing = await turso.execute("SELECT COUNT(*) as count FROM learned_vocab;");
    const count = Number(existing.rows[0]?.count || 0);

    if (count === 0) {
      console.log("[Turso] Mengisi data awal ke tabel learned_vocab...");
      await turso.batch([
        {
          sql: `INSERT OR IGNORE INTO learned_vocab (term_maanyan, meaning_indonesian, category, example_sentence, contributor)
                VALUES (?, ?, ?, ?, ?);`,
          args: ["wusah", "hujan", "Alam & Cuaca", "wusah tatu'u ta'ati (hujan sangat lebat sekarang)", "Sistem Seed"]
        },
        {
          sql: `INSERT OR IGNORE INTO learned_vocab (term_maanyan, meaning_indonesian, category, example_sentence, contributor)
                VALUES (?, ?, ?, ?, ?);`,
          args: ["hinut", "lapar sekali hingga lemas", "Tingkat Kelaparan", "aku hinut daya puang kuman (aku lapar banget lemas karena belum makan)", "Sistem Seed"]
        },
        {
          sql: `INSERT OR IGNORE INTO learned_vocab (term_maanyan, meaning_indonesian, category, example_sentence, contributor)
                VALUES (?, ?, ?, ?, ?);`,
          args: ["tatu'u", "sangat / sekali", "Partikel Penegas", "kena tatu'u (benar sekali / tepat sekali)", "Sistem Seed"]
        }
      ]);
    }

    console.log("[Turso] Inisialisasi tabel Turso berhasil!");
    return { success: true, message: "Semua tabel Turso (learned_vocab, learned_rules, user_sessions) berhasil dibuat dan disiapkan!" };
  } catch (error: any) {
    console.error("[Turso] Error saat inisialisasi tabel:", error);
    return { success: false, message: error.message || "Gagal mengeksekusi migrasi Turso" };
  }
}

export async function fetchAllVocabFromTurso(): Promise<any[]> {
  const turso = getTursoClient();
  if (!turso) return [];

  try {
    const result = await turso.execute("SELECT * FROM learned_vocab ORDER BY id DESC;");
    return result.rows.map(row => ({
      id: String(row.id),
      term_maanyan: String(row.term_maanyan || ""),
      meaning_indonesian: String(row.meaning_indonesian || ""),
      category: String(row.category || "Umum"),
      example_sentence: String(row.example_sentence || ""),
      contributor: String(row.contributor || "Turso User"),
      created_at: String(row.created_at || new Date().toISOString())
    }));
  } catch (error) {
    console.error("[Turso] Gagal fetch learned_vocab:", error);
    return [];
  }
}

export async function insertVocabToTurso(
  term: string,
  meaning: string,
  category: string = "Umum",
  example: string = "",
  contributor: string = "User"
): Promise<boolean> {
  const turso = getTursoClient();
  if (!turso) return false;

  try {
    await turso.execute({
      sql: `INSERT INTO learned_vocab (term_maanyan, meaning_indonesian, category, example_sentence, contributor, created_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(term_maanyan) DO UPDATE SET
              meaning_indonesian = excluded.meaning_indonesian,
              category = excluded.category,
              example_sentence = CASE WHEN excluded.example_sentence != '' THEN excluded.example_sentence ELSE learned_vocab.example_sentence END,
              created_at = CURRENT_TIMESTAMP;`,
      args: [term.toLowerCase().trim(), meaning.toLowerCase().trim(), category.trim(), example.trim(), contributor]
    });
    return true;
  } catch (error) {
    console.error("[Turso] Gagal insert learned_vocab:", error);
    return false;
  }
}

export async function deleteVocabFromTurso(idOrTerm: string): Promise<boolean> {
  const turso = getTursoClient();
  if (!turso) return false;

  try {
    await turso.execute({
      sql: `DELETE FROM learned_vocab WHERE id = ? OR term_maanyan = ?;`,
      args: [idOrTerm, idOrTerm.toLowerCase()]
    });
    return true;
  } catch (error) {
    console.error("[Turso] Gagal delete learned_vocab:", error);
    return false;
  }
}

export async function fetchAllRulesFromTurso(): Promise<any[]> {
  const turso = getTursoClient();
  if (!turso) return [];

  try {
    const result = await turso.execute("SELECT * FROM learned_rules ORDER BY id DESC;");
    return result.rows.map(row => ({
      id: String(row.id),
      title: String(row.title || ""),
      rule_description: String(row.rule_description || ""),
      example: String(row.example || ""),
      contributor: String(row.contributor || "Turso User"),
      created_at: String(row.created_at || new Date().toISOString())
    }));
  } catch (error) {
    console.error("[Turso] Gagal fetch learned_rules:", error);
    return [];
  }
}

export async function insertRuleToTurso(
  title: string,
  ruleDescription: string,
  example: string = "",
  contributor: string = "User"
): Promise<boolean> {
  const turso = getTursoClient();
  if (!turso) return false;

  try {
    await turso.execute({
      sql: `INSERT INTO learned_rules (title, rule_description, example, contributor, created_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP);`,
      args: [title.trim(), ruleDescription.trim(), example.trim(), contributor]
    });
    return true;
  } catch (error) {
    console.error("[Turso] Gagal insert learned_rules:", error);
    return false;
  }
}
