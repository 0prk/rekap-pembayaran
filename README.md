# Rekap Pembayaran

> **Rekapitulasi honor & pajak dari Excel — tanpa pivot manual.**

Unggah file Excel/CSV yang dihasilkan sistem pemindahbukuan, langsung dapat rekap per penerima, per jenis pajak, per keterangan, dan per bulan. Plus cek konsistensi bruto = pajak + netto.

**100% diproses di browser. File tidak pernah dikirim ke server manapun.**

## Fitur

| Fitur | Keterangan |
|-------|-----------|
| 📊 **Rekap per Penerima** | Nama, rekening, NPWP/NIK, jumlah transaksi, total bruto/pajak/netto |
| 💰 **Rekap per Jenis Pajak** | Total per jenis (PPh23 2%, 4%, dll), kode billing |
| 📋 **Rekap per Keterangan & Bulan** | Agregasi otomatis berdasarkan kolom teks |
| ✅ **Validasi Otomatis** | Cek konsistensi bruto-pajak-netto, duplikat baris, rekening tidak valid |
| 📥 **Export CSV** | Setiap tab bisa diekspor ke CSV (Excel-friendly, BOM UTF-8) |
| 🖨️ **Cetak / PDF** | Cetak langsung dari browser (A4 landscape) |
| 📱 **Mobile-friendly** | Bisa dipakai di HP tanpa install apa pun |
| 🔒 **Privasi** | Semua proses di browser; data tidak keluar perangkat |

## Format yang dikenali

1. **Permohonan Pemindahbukuan** (9 kolom)  
   `No · Keterangan · Bulan · Penerima · No. Rekening · Nominal Bruto · Potongan Pajak · Nominal Pajak · Nominal Netto`

2. **Rincian Honor & Kontribusi** (5 kolom)  
   `NO · KETERANGAN · BLN · No. REKENING · NOMINAL`

3. **Pembayaran Pajak** (4 kolom)  
   `NO · KETERANGAN · KODE BILLING · NOMINAL`

4. **Format umum / custom** — lewat pemetaan kolom manual

## Cara pakai

1. Buka [rekap-pembayaran](https://0prk.github.io/rekap-pembayaran/)
2. Jatuhkan atau pilih file Excel/CSV
3. Cek pemetaan kolom (otomatis terdeteksi)
4. Tekan **Proses rekap**
5. Lihat hasil di tiap tab, export atau cetak

## Tech stack

- HTML + CSS + Vanilla JS (ES Modules)
- [SheetJS](https://sheetjs.com/) untuk baca .xlsx/.xls
- Deploy: GitHub Pages (Actions)
- Tanpa build step, tanpa framework, tanpa server

## License

MIT
