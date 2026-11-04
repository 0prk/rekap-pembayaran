/**
 * report.js — rekapitulasi + validasi konsistensi
 */

import { parseNumber } from './parser.js';

/* ------------------------------------------------------------------ *
 * FORMAT
 * ------------------------------------------------------------------ */

export function fmtNum(n) {
  if (n == null || !Number.isFinite(n)) return '-';
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n);
}

export function fmtIDR(n) {
  if (n == null || !Number.isFinite(n)) return '-';
  return 'Rp ' + new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Math.round(n));
}

/* ------------------------------------------------------------------ *
 * BANGUN REKAP
 * ------------------------------------------------------------------ */

/**
 * rows    : array of array (seluruh baris sheet)
 * header  : index baris header
 * mapping : { field: index } (-1 = tidak dipakai)
 */
export function buildReport(rows, header, mapping) {
  const body = rows.slice(header + 1);
  const records = [];
  const issues = [];

  body.forEach((row, i) => {
    const rowNo = header + i + 2; // 1-indexed + header + 1 baris judul
    const get = (key) => (mapping[key] === undefined || mapping[key] < 0) ? '' : (row[mapping[key]] ?? '');
    const getNum = (key) => (mapping[key] === undefined || mapping[key] < 0) ? null : parseNumber(row[mapping[key]]);

    const rec = {
      rowNo,
      nama: String(get('nama')).trim(),
      rekening: String(get('rekening')).trim(),
      npwp: String(get('npwp')).trim(),
      keterangan: String(get('keterangan')).trim(),
      bulan: String(get('bulan')).trim(),
      bruto: getNum('bruto'),
      pajak: getNum('pajak'),
      netto: getNum('netto'),
      jenisPajak: String(get('jenisPajak')).trim(),
      kodeBilling: String(get('kodeBilling')).trim(),
      persen: getNum('persen'),
    };

    // Baris kosong secara substansi -> lewati
    const adaNilai = rec.bruto != null || rec.pajak != null || rec.netto != null;
    const adaLabel = rec.nama || rec.keterangan || rec.bulan;
    if (!adaNilai && !adaLabel) return;

    // Normalisasi: bila neto kosong tapi ada bruto & pajak -> hitung.
    if (rec.netto == null && rec.bruto != null && rec.pajak != null) {
      rec.netto = rec.bruto - rec.pajak;
      rec._nettoHitung = true;
    }
    // Bila bruto kosong tapi ada pajak & netto -> hitung.
    if (rec.bruto == null && rec.pajak != null && rec.netto != null) {
      rec.bruto = rec.pajak + rec.netto;
      rec._brutoHitung = true;
    }
    // Bila pajak kosong tapi ada bruto & netto -> hitung.
    if (rec.pajak == null && rec.bruto != null && rec.netto != null) {
      rec.pajak = rec.bruto - rec.netto;
      rec._pajakHitung = true;
    }

    records.push(rec);
  });

  /* ---------- agregasi ---------- */
  const totals = { bruto: 0, pajak: 0, netto: 0, rows: records.length };
  const byPenerima = new Map();
  const byPajak = new Map();
  const byKeterangan = new Map();
  const byBulan = new Map();

  for (const r of records) {
    totals.bruto += r.bruto ?? 0;
    totals.pajak += r.pajak ?? 0;
    totals.netto += r.netto ?? 0;

    // per penerima
    const keyP = (r.nama || '(tanpa nama)').trim();
    if (!byPenerima.has(keyP)) {
      byPenerima.set(keyP, {
        key: keyP, nama: r.nama, rekening: r.rekening, npwp: r.npwp,
        jumlah: 0, bruto: 0, pajak: 0, netto: 0, jenisPajak: new Set(), keterangan: new Set(),
      });
    }
    const p = byPenerima.get(keyP);
    p.jumlah++;
    p.bruto += r.bruto ?? 0;
    p.pajak += r.pajak ?? 0;
    p.netto += r.netto ?? 0;
    if (!p.rekening && r.rekening) p.rekening = r.rekening;
    if (!p.npwp && r.npwp) p.npwp = r.npwp;
    if (r.jenisPajak) p.jenisPajak.add(r.jenisPajak);
    if (r.keterangan) p.keterangan.add(r.keterangan);

    // per jenis pajak
    const keyJ = (r.jenisPajak || '(tanpa jenis pajak)').trim();
    if (!byPajak.has(keyJ)) byPajak.set(keyJ, { key: keyJ, nama: r.jenisPajak, jumlah: 0, nominal: 0, persen: r.persen, billing: [] });
    const j = byPajak.get(keyJ);
    j.jumlah++;
    j.nominal += r.pajak ?? 0;
    if (j.persen == null && r.persen != null) j.persen = r.persen;
    if (r.kodeBilling) j.billing.push(r.kodeBilling);

    // per keterangan
    const keyK = (r.keterangan || '(tanpa keterangan)').trim();
    if (!byKeterangan.has(keyK)) byKeterangan.set(keyK, { key: keyK, nama: r.keterangan, jumlah: 0, bruto: 0, pajak: 0, netto: 0 });
    const k = byKeterangan.get(keyK);
    k.jumlah++;
    k.bruto += r.bruto ?? 0;
    k.pajak += r.pajak ?? 0;
    k.netto += r.netto ?? 0;

    // per bulan
    const keyB = (r.bulan || '(tanpa bulan)').trim();
    if (!byBulan.has(keyB)) byBulan.set(keyB, { key: keyB, nama: r.bulan, jumlah: 0, bruto: 0, pajak: 0, netto: 0 });
    const b = byBulan.get(keyB);
    b.jumlah++;
    b.bruto += r.bruto ?? 0;
    b.pajak += r.pajak ?? 0;
    b.netto += r.netto ?? 0;
  }

  const sortBy = (map, field) => [...map.values()].sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0));

  /* ---------- validasi ---------- */
  const seen = new Map();
  for (const r of records) {
    // 1. konsistensi bruto = pajak + netto
    if (r.bruto != null && r.pajak != null && r.netto != null) {
      const selisih = r.bruto - (r.pajak + r.netto);
      if (Math.abs(selisih) > 1) {
        issues.push({
          level: 'error',
          msg: `Baris ${r.rowNo}: bruto ≠ pajak + netto (selisih ${fmtNum(selisih)})`,
        });
      }
    }
    // 2. duplikat baris identik
    const sig = [r.nama, r.rekening, r.keterangan, r.bulan, r.bruto, r.pajak, r.netto].join('|');
    if (seen.has(sig)) {
      issues.push({ level: 'warn', msg: `Baris ${r.rowNo}: duplikat dari baris ${seen.get(sig)} (${r.nama || 'tanpa nama'})` });
    } else {
      seen.set(sig, r.rowNo);
    }
    // 3. rekening bermasalah
    if (r.rekening && !/^[0-9]{6,20}$/.test(r.rekening.replace(/[\s.-]/g, ''))) {
      issues.push({ level: 'warn', msg: `Baris ${r.rowNo}: nomor rekening tidak valid ("${r.rekening}")` });
    }
    // 4. nominal negatif
    if ((r.bruto ?? 0) < 0 || (r.pajak ?? 0) < 0 || (r.netto ?? 0) < 0) {
      issues.push({ level: 'warn', msg: `Baris ${r.rowNo}: ada nominal negatif` });
    }
    // 5. nilai dihitung otomatis
    if (r._nettoHitung || r._brutoHitung || r._pajakHitung) {
      issues.push({ level: 'warn', msg: `Baris ${r.rowNo}: ada kolom nominal kosong, nilainya dihitung ulang` });
    }
  }

  // 6. kolom inti tak terdeteksi
  for (const [key, label] of [['bruto', 'Nominal Bruto'], ['pajak', 'Nominal Pajak'], ['netto', 'Nominal Netto']]) {
    if (mapping[key] === undefined || mapping[key] < 0) {
      issues.push({ level: 'warn', msg: `Kolom "${label}" tidak dipetakan — total terkait mungkin nol` });
    }
  }

  // ringkas
  const issuesTrimmed = issues.slice(0, 200);
  if (issues.length > 200) {
    issuesTrimmed.push({ level: 'warn', msg: `…dan ${issues.length - 200} catatan lain yang tidak ditampilkan` });
  }

  return {
    records,
    totals,
    byPenerima: sortBy(byPenerima, 'netto'),
    byPajak: sortBy(byPajak, 'nominal'),
    byKeterangan: sortBy(byKeterangan, 'netto'),
    byBulan: sortBy(byBulan, 'netto'),
    issues: issuesTrimmed,
    issueCount: issues.length,
    errorCount: issues.filter(i => i.level === 'error').length,
  };
}

/* ------------------------------------------------------------------ *
 * EXPORT CSV (Excel-friendly: sep=; + BOM UTF-8)
 * ------------------------------------------------------------------ */

export function toCSV(headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(';')];
  for (const r of rows) lines.push(r.map(esc).join(';'));
  return '\uFEFFsep=;\r\n' + lines.join('\r\n');
}
