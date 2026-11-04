import { FIELDS, readFile, detectHeaderRow, guessMapping, detectFormat, parseNumber } from './parser.js';
import { buildReport, fmtIDR, fmtNum, toCSV } from './report.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  fileName: null,
  sheets: [],
  activeSheetIdx: 0,
  headerRow: 0,
  mapping: {},
  report: null,
  activeTab: 'penerima',
};

/* ------------------------------------------------------------------ *
 * UI HELPERS
 * ------------------------------------------------------------------ */

function toast(msg, type = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + (type === 'err' ? 'err' : '');
  setTimeout(() => t.classList.remove('show'), 2600);
}

function toggle(id, show) {
  const el = $(id);
  if (!el) return;
  el.classList.toggle('hidden', !show);
}

function h(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

function on(el, ev, fn) { el.addEventListener(ev, fn); }

/* ------------------------------------------------------------------ *
 * EVENTS: UPLOAD
 * ------------------------------------------------------------------ */

const dropzone = $('#dropzone');
const fileInput = $('#file-input');

on(dropzone, 'click', () => fileInput.click());
on(dropzone, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
on(dropzone, 'dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
on(dropzone, 'dragleave', () => dropzone.classList.remove('drag'));
on(dropzone, 'drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f) loadFile(f);
});
on(fileInput, 'change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });

on($('#btn-reset'), 'click', resetAll);
on($('#btn-proses'), 'click', process);
on($('#btn-sample'), 'click', loadSample);
on($('#btn-paste-toggle'), 'click', () => toggle('#paste-wrap', true));
on($('#btn-paste'), 'click', loadPaste);
on($('#btn-export'), 'click', () => exportCSV(false));
on($('#btn-export-all'), 'click', () => exportCSV(true));
on($('#btn-print'), 'click', () => window.print());

// Tabs
on($('#tabs'), 'click', (e) => {
  const t = e.target.closest('.tab');
  if (!t) return;
  state.activeTab = t.dataset.tab;
  $$('.tab').forEach(b => b.classList.toggle('active', b === t));
  renderTab();
});

/* ------------------------------------------------------------------ *
 * LOAD FILE / PASTE
 * ------------------------------------------------------------------ */

async function loadFile(file) {
  try {
    state.fileName = file.name;
    state.sheets = await readFile(file);
    state.activeSheetIdx = Math.min(state.activeSheetIdx, state.sheets.length - 1);
    startMapping();
    toast(`Terbaca: ${file.name}`);
  } catch (err) {
    toast(err.message, 'err');
    console.error(err);
  }
}

function loadPaste() {
  const raw = $('#paste-area').value;
  if (!raw.trim()) { toast('Tempelkan data dulu.', 'err'); return; }
  const rows = raw.split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t'));
  state.fileName = 'data-tempel.csv';
  state.sheets = [{ name: 'Tempelan', rows }];
  state.activeSheetIdx = 0;
  startMapping();
  toggle('#paste-wrap', false);
  toast('Data tempel siap diproses');
}

async function loadSample() {
  try {
    const res = await fetch('./sample/contoh-permohonan.csv');
    if (!res.ok) throw new Error('File contoh belum tersedia.');
    const text = await res.text();
    const rows = text.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(';'));
    state.fileName = 'contoh-permohonan.csv';
    state.sheets = [{ name: 'Contoh', rows }];
    state.activeSheetIdx = 0;
    startMapping();
    toast('Contoh data dimuat. Tekan "Proses rekap".');
  } catch (err) {
    toast(err.message, 'err');
  }
}

function resetAll() {
  state.fileName = null;
  state.sheets = [];
  state.mapping = {};
  state.report = null;
  fileInput.value = '';
  $('#paste-area').value = '';
  toggle('#paste-wrap', false);
  toggle('#step-map', false);
  toggle('#step-report', false);
  toggle('#step-upload', true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------------------------------------------ *
 * MAPPING UI
 * ------------------------------------------------------------------ */

function startMapping() {
  const sheet = state.sheets[state.activeSheetIdx];
  state.headerRow = detectHeaderRow(sheet.rows);
  state.mapping = guessMapping(sheet.rows[state.headerRow] || []);

  renderSheetTabs();
  renderMapping();
  renderPreview();
  toggle('#step-upload', false);
  toggle('#step-report', false);
  toggle('#step-map', true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderSheetTabs() {
  const wrap = $('#sheet-tabs');
  if (state.sheets.length < 2) { wrap.classList.add('hidden'); wrap.innerHTML = ''; return; }
  wrap.classList.remove('hidden');
  wrap.innerHTML = state.sheets.map((s, i) =>
    `<button class="sheet-tab ${i === state.activeSheetIdx ? 'active' : ''}" data-idx="${i}" type="button">${h(s.name)}</button>`
  ).join('');
  wrap.querySelectorAll('.sheet-tab').forEach(btn =>
    on(btn, 'click', () => { state.activeSheetIdx = +btn.dataset.idx; startMapping(); })
  );
}

function renderMapping() {
  const sheet = state.sheets[state.activeSheetIdx];
  const headers = (sheet.rows[state.headerRow] || []).map(c => String(c ?? '').trim());
  const fmt = detectFormat(headers, state.mapping);

  const grid = $('#map-grid');
  grid.innerHTML = `<div class="map-item" style="grid-column:1/-1; font-size:.8rem; color:var(--muted);">Format terdeteksi: <b>${h(fmt)}</b> · baris header: <b>${state.headerRow + 1}</b> · ${headers.length} kolom</div>`;

  grid.innerHTML += FIELDS.map(f => {
    const idx = state.mapping[f.key];
    const mapped = idx != null && idx >= 0;
    return `
      <div class="map-item ${mapped ? 'mapped' : 'unmapped'}">
        <label for="map-${f.key}">${h(f.label)}</label>
        <select id="map-${f.key}" data-key="${f.key}">
          <option value="-1">(tidak dipakai)</option>
          ${headers.map((hText, i) => `<option value="${i}" ${i === idx ? 'selected' : ''}>${h(i + 1)}. ${h(hText)}</option>`).join('')}
        </select>
        <span class="hintline">${h(f.hint)}</span>
      </div>`;
  }).join('');

  grid.querySelectorAll('select').forEach(sel => {
    on(sel, 'change', () => {
      state.mapping[sel.dataset.key] = +sel.value;
      renderMapping();
      renderPreview();
    });
  });
}

function renderPreview() {
  const sheet = state.sheets[state.activeSheetIdx];
  const headers = (sheet.rows[state.headerRow] || []).map(c => String(c ?? '').trim());
  const body = sheet.rows.slice(state.headerRow + 1, state.headerRow + 6);

  const table = $('#preview-table');
  table.innerHTML = `
    <thead><tr>${headers.map(h => `<th>${h(h)}</th>`).join('')}</tr></thead>
    <tbody>${body.map(row => `<tr>${row.map(c => `<td>${h(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  `;
}

/* ------------------------------------------------------------------ *
 * PROSES & RENDER REPORT
 * ------------------------------------------------------------------ */

function process() {
  const sheet = state.sheets[state.activeSheetIdx];
  const headers = (sheet.rows[state.headerRow] || []).map(c => String(c ?? '').trim());

  // hanya simpan mapping yang dipilih
  const active = {};
  for (const f of FIELDS) {
    const idx = state.mapping[f.key];
    if (idx != null && idx >= 0) active[f.key] = idx;
  }

  const report = buildReport(sheet.rows, state.headerRow, active);
  state.report = report;

  renderSummary(report);
  renderIssues(report);
  renderTab();

  toggle('#step-map', false);
  toggle('#step-report', true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderSummary(r) {
  $('#summary').innerHTML = `
    <div class="stat bruto"><div class="label">Total Bruto</div><div class="value money">${fmtIDR(r.totals.bruto)}</div></div>
    <div class="stat pajak"><div class="label">Total Pajak</div><div class="value money">${fmtIDR(r.totals.pajak)}</div></div>
    <div class="stat netto"><div class="label">Total Netto</div><div class="value money">${fmtIDR(r.totals.netto)}</div></div>
    <div class="stat"><div class="label">Jumlah Baris</div><div class="value">${fmtNum(r.totals.rows)}</div></div>
  `;
}

function renderIssues(r) {
  const wrap = $('#issues');
  if (!r.issues.length) {
    wrap.className = 'issues ok';
    wrap.innerHTML = '<h4>✓ Tidak ada masalah</h4><p style="margin:0;font-size:.82rem;color:var(--muted);">Semua baris konsisten dan rekening valid.</p>';
    return;
  }
  const klass = r.errorCount > 0 ? 'issues err' : 'issues warn';
  const label = r.errorCount > 0 ? `Terdapat ${r.errorCount} error & ${r.issues.length - r.errorCount} peringatan` : `${r.issues.length} peringatan`;
  wrap.className = klass;
  wrap.innerHTML = `<h4>⚠ ${h(label)}</h4><ul>${r.issues.map(i => `<li class="${h(i.level)}">${h(i.msg)}</li>`).join('')}</ul>`;
}

function renderTab() {
  const r = state.report;
  const tab = state.activeTab;
  const content = $('#tab-content');
  if (!r) { content.innerHTML = ''; return; }

  if (tab === 'penerima') {
    content.innerHTML = makeTable(
      ['#', 'Nama Penerima', 'No. Rekening', 'NPWP/NIK', 'Jumlah', 'Total Bruto', 'Total Pajak', 'Total Netto', 'Jenis Pajak'],
      r.byPenerima.map((p, i) => [
        i + 1,
        p.nama, p.rekening, p.npwp,
        p.jumlah,
        fmtIDR(p.bruto), fmtIDR(p.pajak), fmtIDR(p.netto),
        [...p.jenisPajak].slice(0, 4).join(', ') || '-'
      ])
    );
  } else if (tab === 'pajak') {
    content.innerHTML = makeTable(
      ['#', 'Jenis Pajak', 'Jumlah Item', 'Total Pajak', 'Persentase', 'Kode Billing'],
      r.byPajak.map((p, i) => [
        i + 1,
        p.nama || '-',
        p.jumlah,
        fmtIDR(p.nominal),
        p.persen != null ? p.persen + '%' : '-',
        p.billing.slice(0, 3).join(', ') + (p.billing.length > 3 ? ` (+${p.billing.length - 3})` : '')
      ])
    );
  } else if (tab === 'keterangan') {
    content.innerHTML = makeTable(
      ['#', 'Keterangan', 'Jumlah', 'Total Bruto', 'Total Pajak', 'Total Netto'],
      r.byKeterangan.map((k, i) => [i + 1, k.nama || '-', k.jumlah, fmtIDR(k.bruto), fmtIDR(k.pajak), fmtIDR(k.netto)])
    );
  } else if (tab === 'bulan') {
    content.innerHTML = makeTable(
      ['#', 'Bulan/Periode', 'Jumlah', 'Total Bruto', 'Total Pajak', 'Total Netto'],
      r.byBulan.map((b, i) => [i + 1, b.nama || '-', b.jumlah, fmtIDR(b.bruto), fmtIDR(b.pajak), fmtIDR(b.netto)])
    );
  } else if (tab === 'mentah') {
    const headers = ['Baris', 'Nama', 'Rekening', 'NPWP/NIK', 'Keterangan', 'Bulan', 'Bruto', 'Pajak', 'Netto', 'Jenis Pajak'];
    content.innerHTML = makeTable(
      headers,
      r.records.map(rec => [
        rec.rowNo, rec.nama, rec.rekening, rec.npwp,
        rec.keterangan, rec.bulan,
        fmtIDR(rec.bruto), fmtIDR(rec.pajak), fmtIDR(rec.netto),
        rec.jenisPajak
      ])
    );
  }
}

function makeTable(headers, rows) {
  if (!rows.length) return '<div class="empty">Tidak ada data untuk tab ini.</div>';
  return `
    <div class="table-wrap"><table class="tbl">
      <thead><tr>${headers.map(hdr => `<th>${h(hdr)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${numClass(headers[i])} ${i === 0 ? 'muted-cell' : ''}">${h(c)}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table></div>
  `;
}

function numClass(header) {
  const hText = String(header).toLowerCase();
  if (hText.includes('bruto') || hText.includes('pajak') || hText.includes('netto') || hText.includes('nominal') || hText.includes('jumlah') || hText.includes('total')) return 'num';
  return '';
}

/* ------------------------------------------------------------------ *
 * EXPORT
 * ------------------------------------------------------------------ */

function exportCSV(allTabs) {
  const r = state.report;
  if (!r) return;
  const nameBase = (state.fileName || 'rekap').replace(/\.[^.]+$/, '');

  if (allTabs) {
    const tabs = ['penerima', 'pajak', 'keterangan', 'bulan'];
    tabs.forEach(tab => exportTab(tab, `${nameBase}-${tab}.csv`));
    toast('Semua tab diekspor');
    return;
  }

  exportTab(state.activeTab, `${nameBase}-${state.activeTab}.csv`);
  toast('CSV siap diunduh');
}

function exportTab(tab, filename) {
  const r = state.report;
  let headers = [], rows = [];
  if (tab === 'penerima') {
    headers = ['No', 'Nama Penerima', 'No. Rekening', 'NPWP/NIK', 'Jumlah', 'Total Bruto', 'Total Pajak', 'Total Netto'];
    rows = r.byPenerima.map((p, i) => [i + 1, p.nama, p.rekening, p.npwp, p.jumlah, p.bruto, p.pajak, p.netto]);
  } else if (tab === 'pajak') {
    headers = ['No', 'Jenis Pajak', 'Jumlah Item', 'Total Pajak', 'Persentase', 'Kode Billing'];
    rows = r.byPajak.map((p, i) => [i + 1, p.nama, p.jumlah, p.nominal, p.persen ?? '', p.billing.join(', ')]);
  } else if (tab === 'keterangan') {
    headers = ['No', 'Keterangan', 'Jumlah', 'Total Bruto', 'Total Pajak', 'Total Netto'];
    rows = r.byKeterangan.map((k, i) => [i + 1, k.nama, k.jumlah, k.bruto, k.pajak, k.netto]);
  } else if (tab === 'bulan') {
    headers = ['No', 'Bulan', 'Jumlah', 'Total Bruto', 'Total Pajak', 'Total Netto'];
    rows = r.byBulan.map((b, i) => [i + 1, b.nama, b.jumlah, b.bruto, b.pajak, b.netto]);
  } else if (tab === 'mentah') {
    headers = ['Baris', 'Nama', 'Rekening', 'NPWP/NIK', 'Keterangan', 'Bulan', 'Bruto', 'Pajak', 'Netto', 'Jenis Pajak'];
    rows = r.records.map(rec => [rec.rowNo, rec.nama, rec.rekening, rec.npwp, rec.keterangan, rec.bulan, rec.bruto, rec.pajak, rec.netto, rec.jenisPajak]);
  }
  download(toCSV(headers, rows), filename, 'text/csv;charset=utf-8;');
}

function download(text, filename, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
}

// shortcut: Ctrl+K fokus ke file input
on(document, 'keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    fileInput.click();
  }
});

// load sample langsung saat hash #sample
if (location.hash === '#sample') {
  loadSample();
}
