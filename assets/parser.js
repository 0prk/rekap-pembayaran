/**
 * parser.js — pembaca file + deteksi format
 * Semua berjalan di browser. Tidak ada request keluar selain memuat halaman.
 */

/* ------------------------------------------------------------------ *
 * FIELD / ALIAS
 * ------------------------------------------------------------------ */

export const FIELDS = [
  { key: 'nama',        label: 'Nama Penerima',   hint: 'penerima / nama_penerima' },
  { key: 'rekening',    label: 'No. Rekening',    hint: 'nomor_rekening / no. rekening' },
  { key: 'npwp',        label: 'NPWP / NIK',      hint: 'npwp_nik / nik' },
  { key: 'keterangan',  label: 'Keterangan',      hint: 'uraian / keterangan' },
  { key: 'bulan',       label: 'Bulan / Periode', hint: 'bulan / bln / periode' },
  { key: 'bruto',       label: 'Nominal Bruto',   hint: 'nominal_bruto / nominal bruto' },
  { key: 'jenisPajak',  label: 'Jenis Pajak',     hint: 'potongan pajak / jenis_pajak' },
  { key: 'pajak',       label: 'Nominal Pajak',   hint: 'nominal_pajak / nominal pajak' },
  { key: 'netto',       label: 'Nominal Netto',   hint: 'nominal_netto / nominal netto' },
  { key: 'kodeBilling', label: 'Kode Billing',    hint: 'kode_billing' },
  { key: 'persen',      label: 'Persentase',      hint: 'persentase / persen' },
];

/** Alias per field, sudah dinormalisasi (lowercase, spasi/dash -> underscore). */
const ALIASES = {
  nama:        ['penerima', 'nama_penerima', 'nama', 'nama_penerima_penerima', 'penerimanya'],
  rekening:    ['no_rekening', 'nomor_rekening', 'no_rek', 'rekening', 'no_konting', 'nomor_rek'],
  npwp:        ['npwp_nik', 'npwp', 'nik', 'npwp_nik_', 'npwpnik', 'npwp_atau_nik'],
  keterangan:  ['keterangan', 'uraian', 'ket', 'keterangan_uraian', 'nama_keterangan'],
  bulan:       ['bulan', 'bln', 'periode', 'bulan_lampiran', 'bln_lampiran'],
  bruto:       ['nominal_bruto', 'nominal_brutto', 'bruto', 'nominal_bruto_rp', 'jumlah_bruto'],
  jenisPajak:  ['potongan_pajak', 'jenis_pajak', 'jenis_pajak_id', 'jenis_pajak_pajak', 'pajak_jenis', 'jenis'],
  pajak:       ['nominal_pajak', 'nominal_potongan_pajak', 'pajak', 'potongan', 'nilai_pajak'],
  netto:       ['nominal_netto', 'netto', 'nominal_bersih', 'nilai_netto'],
  kodeBilling: ['kode_billing', 'kodebilling', 'billing', 'kode_billing_pajak'],
  persen:      ['persentase', 'persen', 'percentage', 'pct'],
};

/** Normalisasi nama header agar perbandingan stabil. */
export function normHeader(h) {
  return String(h ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/* ------------------------------------------------------------------ *
 * DELIMITER & CSV
 * ------------------------------------------------------------------ */

function countOutsideQuotes(line, delim) {
  let inQ = false, n = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (!inQ && c === delim) n++;
  }
  return n;
}

/** Tebak delimiter: ; , tab | — pilih yang paling konsisten. */
export function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).filter(l => l.trim() !== '').slice(0, 30);
  if (!sample.length) return ',';

  let best = ',', bestScore = -Infinity;
  for (const d of [',', ';', '\t', '|']) {
    const counts = sample.map(l => countOutsideQuotes(l, d));
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((a, b) => a + (b - avg) ** 2, 0) / counts.length;
    const score = avg === 0 ? -Infinity : avg - variance * 3;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/** Parser CSV/TSV yang aman terhadap tanda kutip, escaped quote, dan CRLF. */
export function parseDelimited(text, delim) {
  const d = delim || detectDelimiter(text);
  const rows = [];
  let row = [], field = '', inQ = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === d) { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* abaikan */ }
      else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

/* ------------------------------------------------------------------ *
 * ANGKA
 * ------------------------------------------------------------------ */

/**
 * Parse angka ala Indonesia & dunia:
 *   "Rp 1.234.567"  -> 1234567
 *   "1.234.567,89"  -> 1234567.89
 *   "1,234,567.89"  -> 1234567.89
 *   "12,5"          -> 12.5
 *   "1.234"         -> 1234
 *   "(1.500)"       -> -1500
 *   "2350000-"      -> -2350000
 */
export function parseNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;

  let s = String(v).trim();
  if (!s || s === '-' || s === '—' || s === '-' || s === 'n/a') return null;

  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }

  s = s.replace(/^\s*(rp|Rp|RP)\s*/i, '');
  s = s.replace(/[\s\u00a0\u202f']/g, '');

  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.endsWith('%')) s = s.slice(0, -1);

  const hasDot = s.includes('.'), hasComma = s.includes(',');

  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
    else s = s.replace(/,/g, '');                                        // 1,234.56
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length >= 1 && parts[1].length <= 2) s = parts[0] + '.' + parts[1];
    else s = s.replace(/,/g, '');
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 2) s = s.replace(/\./g, '');                      // 1.234.567
    else if (parts[1].length === 3) s = parts[0] + parts[1];             // 1.234 -> 1234
    else s = parts[0] + '.' + parts[1];                                  // 12.5
  }

  s = s.replace(/[^0-9.]/g, '');
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/* ------------------------------------------------------------------ *
 * BACA FILE
 * ------------------------------------------------------------------ */

/** Baca file jadi { sheets: [{name, rows}] }. */
export async function readFile(file) {
  const name = (file.name || '').toLowerCase();

  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type?.includes('csv')) {
    const text = await file.text();
    return [{ name: file.name || 'CSV', rows: parseDelimited(text) }];
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.xlsm')) {
    if (typeof XLSX === 'undefined') {
      throw new Error('Pustaka Excel gagal dimuat. Muat ulang halaman, atau simpan file sebagai CSV.');
    }
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: false });
    const sheets = wb.SheetNames.map(sn => {
      const ws = wb.Sheets[sn];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: false });
      return { name: sn, rows: rows.map(r => r.map(c => (c == null ? '' : c))) };
    }).filter(s => s.rows.length);
    if (!sheets.length) throw new Error('Workbook tidak berisi data yang bisa dibaca.');
    return sheets;
  }

  // Fallback: coba baca sebagai teks lalu CSV.
  const text = await file.text();
  return [{ name: file.name || 'Data', rows: parseDelimited(text) }];
}

/* ------------------------------------------------------------------ *
 * DETEKSI HEADER & PEMETAAN
 * ------------------------------------------------------------------ */

/** Cari baris mana yang paling cocok jadi baris header. */
export function detectHeaderRow(rows) {
  const limit = Math.min(rows.length, 25);
  let best = { idx: 0, score: -1, mapped: 0 };

  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] || []).map(normHeader);
    const nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length < 2) continue;

    let score = 0, mapped = 0;
    for (const key of Object.keys(ALIASES)) {
      const hit = cells.some(c => c && ALIASES[key].includes(c));
      if (hit) { score += 3; mapped++; }
    }
    // Baris isi biasanya banyak mengulang nilai -> skor lebih rendah
    const dupRatio = 1 - new Set(nonEmpty).size / nonEmpty.length;
    score -= dupRatio * 4;
    // Baris judul (1-2 kata) kurang Likely
    if (nonEmpty.length <= 2) score -= 2;

    if (score > best.score) best = { idx: i, score, mapped };
  }
  return best.idx;
}

/** Tebak pemetaan kolom berdasarkan header. Kembalikan { field: indexAtas } (-1 = tak ada). */
export function guessMapping(headers) {
  const cells = headers.map(normHeader);
  const mapping = {};
  const used = new Set();

  for (const key of Object.keys(ALIASES)) {
    let found = -1;
    for (const alias of ALIASES[key]) {
      const idx = cells.findIndex((c, i) => c === alias && !used.has(i));
      if (idx !== -1) { found = idx; break; }
    }
    if (found === -1) {
      for (const alias of ALIASES[key]) {
        const idx = cells.findIndex((c, i) => c && c.includes(alias) && !used.has(i));
        if (idx !== -1) { found = idx; break; }
      }
    }
    mapping[key] = found;
    if (found !== -1) used.add(found);
  }

  // Heuristik format "Rincian Honor": kolom NOMINAL tunggal = nilai netto.
  const hasBruto = mapping.bruto !== -1;
  const hasNetto = mapping.netto !== -1;
  if (!hasBruto && !hasNetto) {
    const nominalIdx = cells.findIndex(c => c === 'nominal' || c === 'nilai' || c === 'jumlah');
    if (nominalIdx !== -1) { mapping.netto = nominalIdx; used.add(nominalIdx); }
  }

  return mapping;
}

/** Deteksi format file untuk memberi catatan ke pengguna. */
export function detectFormat(headers, mapping) {
  const cells = headers.map(normHeader);
  const has = (...al) => al.some(a => cells.includes(a));
  if (has('nominal_bruto', 'nominal_brutto', 'bruto') && has('no_rekening', 'nomor_rekening')) {
    return 'Permohonan Pemindahbukuan';
  }
  if (has('kode_billing', 'kodebilling')) return 'Pembayaran Pajak';
  if (has('nominal') && has('no_rekening', 'nomor_rekening')) return 'Rincian Honor';
  if (mapping.bruto !== -1 && mapping.netto !== -1) return 'Permohonan Pemindahbukuan';
  return 'Format umum';
}
