import { createClient, Client } from "@libsql/client";
import { COMPREHENSIVE_MAANYAN_VOCAB } from "../data/comprehensiveVocab";

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

    // Masukkan seluruh perbendaharaan kata dari Core Knowledge Base ke Turso (INSERT OR IGNORE agar tidak menimpa kata yang sudah ada)
    console.log("[Turso] Melakukan sinkronisasi kosakata lengkap dari Knowledge Base ke Turso...");
    
    const allCoreVocab = [
      { term: "nguta / kuman", meaning: "makan", category: "Kosakata Dasar", example: "hie nguta ta'ati (siapa makan sekarang)" },
      { term: "kuman", meaning: "makan", category: "Kosakata Dasar", example: "aku kuman nahi (saya makan nasi)" },
      { term: "nguta", meaning: "makan", category: "Kosakata Dasar", example: "nguta nelang bapaner (makan sambil berbicara)" },
      { term: "nahi", meaning: "nasi", category: "Kosakata Dasar", example: "nahi ma'ang (nasi hangat)" },
      { term: "waday", meaning: "kue / kudapan", category: "Kosakata Dasar", example: "kuman waday (makan kue)" },
      { term: "ranu", meaning: "air", category: "Kosakata Dasar", example: "ngisep ranu (minum air)" },
      { term: "hungei", meaning: "sungai", category: "Kosakata Dasar", example: "tulak ma hungei (pergi ke sungai)" },
      { term: "ume", meaning: "ladang / kebun", category: "Kosakata Dasar", example: "bagawi ma ume (bekerja di ladang)" },
      { term: "lewu", meaning: "rumah", category: "Kosakata Dasar", example: "mulek ma lewu (pulang ke rumah)" },
      { term: "tumpuk", meaning: "kampung / desa", category: "Kosakata Dasar", example: "tumpuk ite (kampung kita)" },
      { term: "yiti", meaning: "ini", category: "Tunjuk & Objek", example: "yiti lewu ku (ini rumah saya)" },
      { term: "yina", meaning: "itu", category: "Tunjuk & Objek", example: "yina ume ni (itu ladangnya)" },
      { term: "yiru / iru", meaning: "itu (objek tertentu)", category: "Tunjuk & Objek", example: "yiru ulun kena (itu orang yang tepat)" },
      { term: "iya", meaning: "anak", category: "Tunjuk & Objek", example: "iya ulun (anak orang)" },
      { term: "ulun", meaning: "orang / manusia", category: "Tunjuk & Objek", example: "ulun Ma'anyan (orang Ma'anyan)" },
      { term: "bagawi", meaning: "bekerja", category: "Aktivitas & Waktu", example: "bagawi ma ume (bekerja di ladang)" },
      { term: "naragu", meaning: "memperbaiki", category: "Aktivitas & Waktu", example: "naragu lewu (memperbaiki rumah)" },
      { term: "mangang", meaning: "memanggang", category: "Aktivitas & Waktu", example: "mangang baui / lauk (memanggang ikan)" },
      { term: "mandre", meaning: "tidur", category: "Aktivitas & Waktu", example: "aku mandre ta'ati (saya tidur sekarang)" },
      { term: "ta'ati", meaning: "sekarang / saat ini", category: "Aktivitas & Waktu", example: "wusah tatu'u ta'ati (hujan sangat lebat sekarang)" },
      { term: "iengen / kamalem", meaning: "malam / kemalaman", category: "Aktivitas & Waktu", example: "mulek kamalem (pulang kemalaman)" },
      { term: "kariwe die", meaning: "nanti sore", category: "Aktivitas & Waktu", example: "kariwe die ite tulak (nanti sore kita berangkat)" },
      { term: "layah", meaning: "lapar (tingkat biasa)", category: "Tingkat Kelaparan", example: "aku layah (saya lapar)" },
      { term: "kalauan", meaning: "sangat lapar", category: "Tingkat Kelaparan", example: "kalauan daya telat kuman (sangat lapar karena telat makan)" },
      { term: "hinut", meaning: "lapar banget mau pingsan / lemas", category: "Tingkat Kelaparan", example: "aku hinut daya puang kuman (saya lapar lemas karena belum makan)" },
      { term: "daya / dagana", meaning: "karena / sebab", category: "Kata Hubung & Partikel", example: "daya puang kuman (karena belum makan)" },
      { term: "kude", meaning: "tapi / tetapi", category: "Kata Hubung & Partikel", example: "aku handak tulak kude wusah (saya mau pergi tapi hujan)" },
      { term: "dadijari", meaning: "jadi / makanya / oleh karena itu", category: "Kata Hubung & Partikel", example: "dadijari kuman ta'ati (makanya makan sekarang)" },
      { term: "ekat", meaning: "cuma / hanya", category: "Kata Hubung & Partikel", example: "ekat hanyu (cuma kamu)" },
      { term: "tatu'u", meaning: "sangat / banget / sungguh", category: "Kata Hubung & Partikel", example: "kena tatu'u (benar sekali / tepat sekali)" },
      { term: "nelang", meaning: "sambil / seraya", category: "Kata Hubung & Partikel", example: "kuman nelang bapaner (makan sambil berbicara)" },
      { term: "baya", meaning: "dan / serta", category: "Kata Hubung & Partikel", example: "aku baya hanyu (saya dan kamu)" },
      { term: "sindrah", meaning: "bersama / dengan", category: "Kata Hubung & Partikel", example: "tulak sindrah kawan (pergi bersama kawan)" },
      { term: "hayu", meaning: "mari / ayo", category: "Kata Hubung & Partikel", example: "hayu ite kuman (ayo kita makan)" },
      { term: "puang ka'itung", meaning: "lupa / tidak teringat", category: "Ungkapan Khas", example: "puang ka'itung ngaran nu (lupa siapa namamu)" },
      { term: "bapaner", meaning: "bicara / mengajar / bercakap", category: "Aktivitas & Waktu", example: "bapaner Dayak Ma'anyan (berbicara bahasa Dayak Ma'anyan)" },
      { term: "luput", meaning: "selesai / usai", category: "Kata Kerja / Kondisi", example: "gawi ku luput (pekerjaan saya selesai)" },
      { term: "aku", meaning: "aku / saya", category: "Kata Ganti", example: "aku ulun Ma'anyan (saya orang Dayak Ma'anyan)" },
      { term: "hanyu", meaning: "kamu / engkau", category: "Kata Ganti", example: "hie ngaran nu hanyu? (siapa namamu kamu?)" },
      { term: "hanye", meaning: "dia / ia", category: "Kata Ganti", example: "hanye bagawi ma ume (dia bekerja di ladang)" },
      { term: "kami / ite", meaning: "kami / kita", category: "Kata Ganti", example: "ite tulak sindrah (kita pergi bersama)" },
      { term: "ere / kere", meaning: "mereka", category: "Kata Ganti", example: "kere mandre (mereka tidur)" },
      { term: "wusah", meaning: "hujan", category: "Alam & Cuaca", example: "wusah tatu'u ta'ati (hujan sangat lebat sekarang)" },
      { term: "puang", meaning: "tidak / bukan", category: "Partikel Penyangkal", example: "puang kuman (belum / tidak makan)" }
    ];

    // Gabungkan dengan 230+ kosakata dari input kamus komprehensif
    const mergedVocab = [
      ...allCoreVocab,
      ...COMPREHENSIVE_MAANYAN_VOCAB
    ];

    const statements = mergedVocab.map(v => ({
      sql: `INSERT OR IGNORE INTO learned_vocab (term_maanyan, meaning_indonesian, category, example_sentence, contributor)
            VALUES (?, ?, ?, ?, ?);`,
      args: [
        v.term.toLowerCase().trim(),
        v.meaning.toLowerCase().trim(),
        v.category || "Kosakata Pengguna",
        v.example || `${v.term} artinya ${v.meaning}`,
        "Pengguna Telegram / Knowledge Base"
      ]
    }));

    // Eksekusi batch sync kosakata secara bertahap (chunk 80 statement per batch agar aman)
    const chunkSize = 80;
    for (let i = 0; i < statements.length; i += chunkSize) {
      const chunk = statements.slice(i, i + chunkSize);
      await turso.batch(chunk);
    }

    // Sync juga aturan tata bahasa inti ke learned_rules
    const coreRules = [
      {
        title: "Struktur Kalimat S-P-O & P-S",
        description: "Struktur kalimat umumnya S-P-O atau P-S (predikat dikedepankan untuk penekanan makna).",
        example: "kuman aku nahi (P-S-O) atau aku kuman nahi (S-P-O)"
      },
      {
        title: "Penegas 'tatu'u' (Sangat / Sekali)",
        description: "Penegas 'tatu'u' (sangat) selalu diletakkan SETELAH kata sifat.",
        example: "layah tatu'u (sangat lapar), wusah tatu'u (hujan sangat deras)"
      },
      {
        title: "Jenjang 3 Tingkat Kelaparan",
        description: "Tingkat rasa lapar memiliki 3 kata spesifik: layah (lapar biasa) -> kalauan (sangat lapar) -> hinut (lapar ekstrem lemas mau pingsan).",
        example: "aku hinut daya puang kuman (saya lemas lapar sekali karena belum makan)"
      },
      {
        title: "Kata Hubung Simultan 'nelang' (Sambil)",
        description: "Konjungsi 'nelang' dipakai untuk dua aktivitas yang dilakukan serentak atau bersamaan.",
        example: "kuman nelang bapaner (makan sambil berbicara)"
      },
      {
        title: "Ungkapan Idiomatis 'Puang Ka'itung'",
        description: "Puang berarti tidak/bukan. 'Puang ka'itung' secara harfiah tidak terhitung/terpikirkan, bermakna 'lupa'.",
        example: "puang ka'itung ngaran nu (aku lupa namamu)"
      },
      {
        title: "Peribahasa 'Tetek Meaw Hang Papuru Tungun'",
        description: "Peribahasa klasik Ma'anyan yang menasihati agar jangan mencela orang lain padahal diri sendiri memiliki kelemahan atau melakukan hal yang sama.",
        example: "Ada kalina: tetek meaw hang papuru tungun"
      },
      {
        title: "Partikel Penyangkal dan Negasi Khas: 'Ang', 'Puang', 'Maka', 'Tuma'",
        description: "Dalam percakapan dan dialek Dayak Ma'anyan, negasi dapat menggunakan 'puang' (formal/umum), 'ang' (percakapan cepat/logat daerah), 'maka' (singkat), atau 'tuma' (penolakan tegas).",
        example: "puang kuman (belum makan), ang sarut (tidak apa-apa), tuma hakun (tidak mau sama sekali)"
      },
      {
        title: "Falsafah Persatuan 'Isa Takewan Isa Supak'",
        description: "Falsafah luhur suku Dayak Ma'anyan yang berarti: 'Walaupun kita tercerai berai atau terpisah-pisah, namun kita tetap satu hati dan satu tujuan'.",
        example: "Isa takewan isa supak"
      },
      {
        title: "Sistem Kekerabatan & Sapaan Hormat Ma'anyan",
        description: "Panggilan kekerabatan memiliki tingkatan spesifik: Amah/Ambah (ayah), Ineh (ibu), Kakah (kakek), Itak/Nini (nenek), Dueh Upu (paman sulung/kakak ayah), Dueh Wawei (bibi sulung), Busu/Mama (paman termuda), Yaya/Tutu (tante muda), Umpu (cucu), Daup (ipar laki-laki), Iwan (ipar perempuan), Dawari (sepupu/sahabat dekat), Pulaksanai (saudara kandung).",
        example: "dawari ku, busu ku, dueh upu"
      }
    ];

    for (const r of coreRules) {
      await turso.execute({
        sql: `INSERT INTO learned_rules (title, rule_description, example, contributor)
              SELECT ?, ?, ?, ?
              WHERE NOT EXISTS (SELECT 1 FROM learned_rules WHERE title = ?);`,
        args: [r.title, r.description, r.example, "Knowledge Base Inti", r.title]
      });
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
