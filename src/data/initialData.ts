import { VocabItem } from '../types';

export const INITIAL_VOCABULARY: VocabItem[] = [
  { term: "nguta / kuman", meaning: "makan", category: "Kosakata Dasar", notes: "kuman dan nguta sering digunakan bergantian untuk makan" },
  { term: "nahi", meaning: "nasi", category: "Kosakata Dasar", notes: "makanan pokok" },
  { term: "waday", meaning: "kue / kudapan", category: "Kosakata Dasar", notes: "kue tradisional atau cemilan khas" },
  { term: "ranu", meaning: "air", category: "Kosakata Dasar", notes: "air minum atau air umum" },
  { term: "hungei", meaning: "sungai", category: "Kosakata Dasar", notes: "aliran air atau sungai" },
  { term: "ume", meaning: "ladang", category: "Kosakata Dasar", notes: "ladang padi / perkebunan" },
  { term: "lewu", meaning: "rumah", category: "Kosakata Dasar", notes: "tempat tinggal atau kampung halaman" },
  { term: "tumpuk", meaning: "kampung / desa", category: "Kosakata Dasar", notes: "pemukiman warga" },
  { term: "yiti", meaning: "ini", category: "Tunjuk & Objek", notes: "kata tunjuk dekat" },
  { term: "yina", meaning: "itu", category: "Tunjuk & Objek", notes: "kata tunjuk jauh" },
  { term: "yiru / iru", meaning: "itu (merujuk objek tertentu)", category: "Tunjuk & Objek", notes: "kata tunjuk objek yang telah dibahas" },
  { term: "iya", meaning: "anak", category: "Tunjuk & Objek", notes: "anak kecil atau keturunan" },
  { term: "ulun", meaning: "orang", category: "Tunjuk & Objek", notes: "manusia atau seseorang" },
  { term: "bagawi", meaning: "bekerja", category: "Aktivitas & Waktu", notes: "melakukan pekerjaan" },
  { term: "naragu", meaning: "memperbaiki", category: "Aktivitas & Waktu", notes: "membenahi barang rusak" },
  { term: "mangang", meaning: "memanggang", category: "Aktivitas & Waktu", notes: "memanggang makanan di atas bara api" },
  { term: "mandre", meaning: "tidur", category: "Aktivitas & Waktu", notes: "istirahat tidur" },
  { term: "ta'ati", meaning: "sekarang / saat ini", category: "Aktivitas & Waktu", notes: "keterangan waktu sekarang" },
  { term: "iengen / kamalem", meaning: "malam / kemalaman", category: "Aktivitas & Waktu", notes: "waktu malam hari" },
  { term: "kariwe die", meaning: "nanti sore", category: "Aktivitas & Waktu", notes: "keterangan waktu sore hari nanti" },
  { term: "layah", meaning: "lapar (tingkat biasa)", category: "Tingkat Kelaparan", notes: "rasa lapar standar saat jam makan tiba" },
  { term: "kalauan", meaning: "sangat lapar", category: "Tingkat Kelaparan", notes: "lapar berat karena terlambat makan" },
  { term: "hinut", meaning: "lapar banget mau pingsan / lemas", category: "Tingkat Kelaparan", notes: "tingkat lapar ekstrem hingga gemetar atau lemas" },
  { term: "daya / dagana", meaning: "karena / sebab", category: "Kata Hubung & Partikel", notes: "konjungsi sebab akibat" },
  { term: "kude", meaning: "tapi / tetapi", category: "Kata Hubung & Partikel", notes: "konjungsi pertentangan" },
  { term: "dadijari", meaning: "jadi / makanya / oleh karena itu", category: "Kata Hubung & Partikel", notes: "konjungsi kesimpulan" },
  { term: "ekat", meaning: "cuma / hanya", category: "Kata Hubung & Partikel", notes: "pembatasan" },
  { term: "tatu'u", meaning: "sangat / banget / sungguh", category: "Kata Hubung & Partikel", notes: "penegas intensitas (misal: layah tatu'u)" },
  { term: "nelang", meaning: "sambil / seraya", category: "Kata Hubung & Partikel", notes: "melakukan dua hal simultan" },
  { term: "baya", meaning: "dan / serta", category: "Kata Hubung & Partikel", notes: "penghubung penambahan" },
  { term: "sindrah", meaning: "bersama / dengan", category: "Kata Hubung & Partikel", notes: "kebersamaan" },
  { term: "hayu", meaning: "mari / ayo", category: "Kata Hubung & Partikel", notes: "ajakan" },
  { term: "puang ka'itung", meaning: "lupa / tidak teringat", category: "Ungkapan Khas", notes: "lupa ingatan akan sesuatu" },
  { term: "bapaner", meaning: "bicara / mengajar / bercakap", category: "Aktivitas & Waktu", notes: "berbicara dalam bahasa Ma'anyan" },
  { term: "luput", meaning: "selesai / usai", category: "Kata Kerja / Kondisi", notes: "pekerjaan atau kondisi telah usai" }
];

export const SAMPLE_QUERIES = [
  "Apa arti kuman dan nguta?",
  "Bagaimana cara bilang 'Saya lapar sekali'?",
  "Jelaskan bedanya layah, kalauan, dan hinut!",
  "Apa bahasa Ma'anyannya 'Nanti sore kita pergi ke ladang'?",
  "Buatkan kuis latihan bahasa Ma'anyan untuk saya!",
  "Kata baru: wusah artinya hujan lebat"
];
