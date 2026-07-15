// Extracts ledger entries from the brand source files (CSV/XLSX) into src/entries.gen.js
// Run: node scripts/extract-entries.mjs   (from app/)
// Entry shape: { id, date: 'YYYY-MM-DD', type, ref, amount, dir: +1|-1, side: 'vendor'|'bch', note }
//   dir +1 = increases what BCH owes (invoice/debit-note); dir -1 = decreases (payment/CN/discount)
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const ROOT = fileURLToPath(new URL('../../', import.meta.url)) // ledgers/

let idc = 0
const mkid = (b) => `${b}-${(++idc).toString(36).padStart(4, '0')}`

const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(/[,₹\s]/g, ''))
  return isNaN(n) ? null : n
}

const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
function parseDate(v) {
  if (!v) return null
  const s = String(v).trim()
  let m
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`
  if ((m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s](\d{2,4})$/))) {
    const yy = m[3].length === 2 ? '20' + m[3] : m[3]
    return `${yy}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`
  }
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) {
    const yy = m[3].length === 2 ? '20' + m[3] : m[3]
    return `${yy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` // dd/mm/yyyy
  }
  return null
}

function sheetRows(path) {
  const wb = XLSX.readFile(ROOT + path)
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false })
}

function csvRows(path) {
  // simple CSV parser handling quoted fields
  const text = readFileSync(ROOT + path, 'utf8').replace(/^﻿/, '')
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

function typeFromLabel(label, dir) {
  const s = String(label || '').toLowerCase()
  if (/opening/.test(s)) return 'opening'
  if (/purchase|invoice/.test(s)) return 'invoice'
  if (/payment|receipt|neft|rtgs|imps|upi|icici|hdfc|bank/.test(s)) return 'payment'
  if (/discount|dis-|cd\b/.test(s)) return 'discount'
  if (/credit/.test(s)) return 'credit-note'
  if (/debit/.test(s)) return 'debit-note'
  return dir < 0 ? 'adjustment' : 'invoice'
}
const sideFor = (type) => (type === 'payment' || (type === 'debit-note') ? 'bch' : 'vendor')

const out = {}
const report = []

/* ---- Lucifer: canonical timeline from Lucifer's own ledger PDFs (transcribed 13-Jul-26) ----
   A3 = FY23-24 · B8 = FY24-25 · B6 = FY25-26 (to 31-Mar-26) · B3 = FY26-27 (to 13-Jul-26)
   Chain verified: opening 0 (Apr-23) -> closing 18,48,717 (13-Jul-26), ties Lucifer's stated closing exactly. */
{
  const dir = 'brands/lucifer/ledger-versions/'
  const parseCsv = (name) => {
    const text = readFileSync(ROOT + dir + name, 'utf8')
    const rows = []
    let row = [], f = '', q = false
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
      else if (c === '"') q = true
      else if (c === ',') { row.push(f); f = '' }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = '' }
      else if (c !== '\r') f += c
    }
    if (f || row.length) { row.push(f); rows.push(row) }
    const h = rows[0]
    return rows.slice(1).filter((r) => r.length > 5).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])))
  }
  const canon = [
    ...parseCsv('ledgerA3.csv').filter((r) => r.row_date >= '2023-04-01' && r.row_date <= '2024-03-31'),
    ...parseCsv('ledgerB8.csv'),
    ...parseCsv('ledgerB6.csv').filter((r) => r.row_date <= '2026-03-31'),
    ...parseCsv('ledgerB3.csv'),
  ].filter((r) => r.vch_type !== 'OPENING' && r.vch_type !== 'CLOSING')
  const entries = []
  for (const r of canon) {
    const debit = num(r.debit), credit = num(r.credit)
    if (!debit && !credit) continue
    const d = debit ? +1 : -1
    let type
    if (/sale/i.test(r.vch_type) && d > 0) type = 'invoice'
    else if (/rcpt|receipt/i.test(r.vch_type)) type = 'payment'
    else if (/slrt|crnt|sirt/i.test(r.vch_type) || /^cn/i.test(r.vch_no || '')) type = 'credit-note'
    else if (d < 0 && /dis|rebate/i.test((r.particulars || '') + (r.vch_no || ''))) type = 'discount'
    else type = d < 0 ? 'adjustment' : 'debit-note'
    const note = [r.narration, r.particulars && !/sales|discount & rebate|hdfc|icici/i.test(r.particulars) ? r.particulars : ''].filter(Boolean).join(' · ').slice(0, 90)
    entries.push({ id: mkid('lu'), date: r.row_date, type, ref: r.vch_no || '', amount: d > 0 ? debit : credit, dir: d, side: sideFor(type), note })
  }

  // Per-invoice discount audit (13-Jul-26 consolidation). s: ok|short|missing|kids|era20|info · g: linked gap #
  const AUDIT_18 = {
    156: { s: 'short', t: '18% via DIS-90 (grouped with 0175): given ₹1,42,402 vs ₹1,42,942 due — group short ₹539', g: 10 },
    175: { s: 'short', t: '18% via DIS-90 (grouped with 0156): group short ₹539', g: 10 },
    208: { s: 'ok', t: '18% exact via DIS-110 (₹1,09,694 with 0237) ✓' },
    237: { s: 'ok', t: '18% exact via DIS-110 (with 0208) ✓' },
    364: { s: 'short', t: 'DIS-210 (18% + ₹150/cycle + ₹19,500 transport) — ₹1,050 short', g: 9 },
    365: { s: 'kids', t: 'Kids bill — zero discount per Prashant 01-Jun-25 (claim only if contested)', g: 4 },
    468: { s: 'missing', t: 'NO discount ever passed — ₹1,822 due @18%', g: 5 },
    600: { s: 'short', t: '12-Mar print granted ₹80,647 → withdrawn → DIS-304 ₹72,895 vs ₹75,607 due — ₹2,712 short', g: 7 },
    689: { s: 'missing', t: 'Discount granted on 12-Mar-26 print (₹23,220) then WITHDRAWN in every later print — ₹21,769 due', g: 2 },
    690: { s: 'kids', t: 'Kids bill — zero discount per policy (claim only if contested)', g: 3 },
    814: { s: 'ok', t: '18% exact via DIS-99 (÷1.05, with 815/849) ✓' },
    815: { s: 'ok', t: '18% exact via DIS-99 ✓' },
    849: { s: 'ok', t: '18% exact via DIS-99 ✓' },
    41: { s: 'short', t: 'Discounted @17% via DIS-100 — Ankush ruling 18% → part of ₹19,415 top-up', g: 6 },
    272: { s: 'short', t: 'Discounted @17% via DIS-100 — 18% top-up due (part of ₹19,415)', g: 6 },
    281: { s: 'short', t: 'Discounted @17% via DIS-100 — 18% top-up due (part of ₹19,415)', g: 6 },
    363: { s: 'missing', t: 'NO discount — ₹3,05,613 due @18% (₹17,82,742 ÷1.05 × 18%, Ankush ruling)', g: 1 },
  }
  const ERA20 = { s: 'era20', t: '20%-era bill — discounts were lump-sum journals (DIS-01→DIS-22), not per-bill; era aggregate short ₹5,22,059 max', g: 26 }
  const DISC_NOTES = {
    'DIS-22': 'Zeroed the account at 20%-era end — equals Prashant\'s three 20-May-25 20% calcs exactly (₹2,30,226)',
    'DIS-90': 'Covers 0156 + 0175 @18% — ₹539 short (gap #10)',
    'DIS-110': 'Covers 0208 + 0237 @18% — exact ✓',
    'DIS 210': 'Covers 0364: 18% + ₹150/cycle + ₹19,500 transport — ₹1,050 short (gap #9)',
    'DIS-304': 'LB/0600 re-grant after the 12-Mar withdrawal — ₹2,712 short (gap #7)',
    'DIS-99': 'Covers 814/815/849 @18% ÷1.05 — exact ✓',
    'DIS-100': '17% on 041/272/281 — Ankush ruling 18% → ₹19,415 top-up due (gap #6)',
    'DIS-01': '20%-era lump-sum', 'DIS-29': '20%-era lump-sum (the chased Jun-24 voucher — found & posted)', 'DIS-98': '20%-era lump-sum',
    'DIS-140': '20%-era lump-sum (narration: Inv 274)', 'DIS-153': '20%-era lump-sum — narration only explains ₹25,681 of ₹1,24,147 (gap #27)', 'DIS-165': '20%-era lump-sum (narration: Inv 534)',
  }
  for (const e of entries) {
    if (e.type === 'invoice') {
      const tail = parseInt((e.ref.match(/(\d+)\s*$/) || [])[1] || '', 10)
      if (e.date >= '2025-06-21' && AUDIT_18[tail]) e.audit = AUDIT_18[tail]
      else if (e.date <= '2025-05-21') e.audit = ERA20
    } else if (e.type === 'discount' && DISC_NOTES[e.ref]) {
      e.audit = { s: 'info', t: DISC_NOTES[e.ref] }
    }
  }
  out.lucifer = { opening: { date: '2023-04-01', amount: 0 }, entries }
}

/* ---- Cultsport: brand's FINAL Curefit Customer Statement (01-Jul-2020 → 15-Jul-2026, from ₹0) ---- */
{
  const rows = sheetRows('brands/cultsport/Curefit_Statement_FINAL_15-Jul-2026.xlsx')
  // Curefit cols: 0 TxnNo | 1 Type | 2 AcctDate | 3 DelivDate | 4 Desc | 5 AdjAgainst | 6 Base | 7 GST | 8 Debit | 9 Credit | 10 Balance
  const TYPE = { 'Invoice': 'invoice', 'Receipt': 'payment', 'Credit Memo': 'credit-note', 'Debit Memo': 'debit-note' }
  // Resolved / credited memos → link to their gap so the ledger shows the gap as done inline
  const CN_GAP = {
    '78278': { g: 5, t: '✓ RESOLVED gap #5 — GST 7% tax discount CN (part of ₹1,13,028)' },
    '78279': { g: 5, t: '✓ RESOLVED gap #5 — tax-rate discount CN' },
    '78280': { g: 5, t: '✓ RESOLVED gap #5 — tax-rate discount CN' },
    '78281': { g: 5, t: '✓ RESOLVED gap #5 — tax-rate discount CN' },
    '79057': { g: 29, t: '✓ RESOLVED gap #29 — 3 phones (secondary sales) ₹64,534' },
    '79058': { g: 25, t: '✓ RESOLVED gap #25 — foot massagers (10-cycle scheme) ₹33,600' },
    '25092': { g: 28, t: '✓ RESOLVED gap #28 — Vortex price diff ₹4,989' },
    '73701': { g: 6, t: '◑ PARTIAL gap #6 — Power/Brave "Cycle Rent" CN ₹2,25,000 (₹1,34,990 balance still open)' },
  }
  const isCD = (d) => /\bCD\b/i.test(d || '')
  const entries = []
  let opening = { date: '2020-07-01', amount: 0 }
  let lastDate = '2020-07-01'
  for (const r of rows) {
    if (!r) continue
    if (/opening balance/i.test(String(r[0] || ''))) { opening = { date: '2020-07-01', amount: num(r[1]) ?? 0 }; continue }
    const type = TYPE[r[1]]
    if (!type) continue // skips header + "Closing Balance" summary row
    const date = parseDate(r[2]) || parseDate(r[3]) || lastDate // some rows have a blank accounting date
    lastDate = date
    const dir = (type === 'invoice' || type === 'debit-note') ? +1 : -1
    const amount = dir > 0 ? num(r[8]) : num(r[9])
    if (!amount) continue
    const desc = String(r[4] || '').trim()
    const adj = String(r[5] || '').trim()
    const ref = String(r[0] || '').trim()
    const e = { id: mkid('cu'), date, type, ref, amount, dir, side: sideFor(type), note: desc || (adj && !/knockoff/i.test(adj) ? adj : '') }
    if (CN_GAP[ref]) e.audit = { s: 'info', t: CN_GAP[ref].t, g: CN_GAP[ref].g }
    else if (type === 'credit-note' && isCD(desc)) e.audit = { s: 'info', t: '8% CD credited — counts toward gap #34 (₹2,27,610 total, 15-Oct-25 batch)', g: 34 }
    entries.push(e)
  }
  out.cultsport = { opening, entries }
}

/* ---- EMotorad: official Hub ledger (descending; compute implied opening) ---- */
{
  const rows = sheetRows('BHARATH_CYCLE_HUB_All_Invoice.xlsx')
  const body = []
  const vtypes = {}
  for (const r of rows.slice(9)) {
    if (!r || r.length < 6) continue
    const date = parseDate(r[1])
    if (!date) continue
    const debit = num(r[2]) || 0, credit = num(r[3]) || 0, outst = num(r[4])
    const vt = String(r[5] || '').trim()
    vtypes[vt] = (vtypes[vt] || 0) + 1
    body.push({ ref: r[0] || '', date, debit, credit, outst, vt })
  }
  body.reverse() // ascending
  const first = body[0]
  const opening = { date: first.date, amount: Math.round((first.outst - (first.debit - first.credit)) * 100) / 100 }
  const entries = []
  for (const b of body) {
    const emit = (dir, amount) => {
      let type
      if (/sales invoice/i.test(b.vt)) type = dir > 0 ? 'invoice' : 'credit-note'
      else if (/payment/i.test(b.vt)) type = 'payment'
      else if (/credit note/i.test(b.vt)) type = 'credit-note'
      else type = dir < 0 ? 'adjustment' : 'debit-note'
      const note = type === 'adjustment' ? 'JV credit'
        : type === 'credit-note' && /sales invoice/i.test(b.vt) ? 'return/CN on sales voucher — verify (gap #24)' : ''
      entries.push({ id: mkid('em'), date: b.date, type, ref: b.ref, amount, dir, side: sideFor(type), note })
    }
    if (b.debit > 0) emit(+1, b.debit)
    if (b.credit > 0) emit(-1, b.credit)
  }
  out.emotorad = { opening, entries }
  report.push('EM voucher types: ' + JSON.stringify(vtypes))
}

/* ---- Aoki: ledger.csv (invoices) + payments.csv ---- */
{
  const inv = csvRows('brands/aoki/ledger.csv')
  const pay = csvRows('brands/aoki/payments.csv')
  const entries = []
  for (const r of inv.slice(1)) {
    const date = parseDate(r[0])
    if (!date || !num(r[5])) continue
    entries.push({ id: mkid('ao'), date, type: 'invoice', ref: `${r[3]}× ${r[4]}`, amount: num(r[5]), dir: +1, side: 'vendor', note: '' })
  }
  for (const r of pay.slice(1)) {
    if (!num(r[1])) continue
    let date = parseDate(r[2])
    let note = r[4] || ''
    if (!date) { date = '2026-03-01'; note = `date "${r[2]}" TBC from bank · ` + note } // two undated Feb/Mar-26 payments (gap #10)
    entries.push({ id: mkid('ao'), date, type: 'payment', ref: r[3] ? `txn ${r[3]}` : `payment #${r[0]}`, amount: num(r[1]), dir: -1, side: 'bch', note })
  }
  out.aoki = { opening: null, entries }
}

/* ---- Raleigh: payments.csv only (BCH side; invoices are Tally prints, not structured) ---- */
{
  const pay = csvRows('brands/raleigh/payments.csv')
  const entries = []
  for (const r of pay.slice(1)) {
    if (r[0] === 'note') continue
    const date = parseDate(r[3])
    if (!date || !num(r[2])) continue
    entries.push({ id: mkid('ra'), date, type: 'payment', ref: r[5] ? `${r[4]} ${r[5]}` : `payment #${r[1]}`, amount: num(r[2]), dir: -1, side: 'bch', note: [r[0], r[6] ? `Naren vch ${r[6]}` : ''].filter(Boolean).join(' · ') })
  }
  out.raleigh = { opening: null, entries }
}

/* ---- Hornback: payments.csv only ---- */
{
  const pay = csvRows('brands/hornback/payments.csv')
  const entries = []
  for (const r of pay.slice(1)) {
    const date = parseDate(r[0])
    if (!date || !num(r[2])) continue
    entries.push({ id: mkid('ho'), date, type: 'payment', ref: r[1] || '', amount: num(r[2]), dir: -1, side: 'bch', note: [r[3] ? `applied to ${r[3]}` : '', r[4] || ''].filter(Boolean).join(' · ') })
  }
  out.hornback = { opening: null, entries }
}

/* ---- Bank-sourced payments (ledgers/bank-statements/normalized.json via scripts/bank.mjs index) ---- */
let bankTx = []
try { bankTx = JSON.parse(readFileSync(ROOT + 'bank-statements/normalized.json', 'utf8')) } catch { console.error('!! bank normalized.json missing — run: node scripts/bank.mjs index') }
const bankPays = (re) => bankTx.filter((t) => t.out > 0 && re.test(t.narration)).map((t) => ({ date: t.date, amount: t.out, note: t.narration.slice(0, 70), bank: t.bank }))

/* ---- Trinity: 1 reviewed invoice + ALL bank payments (vendor invoice side still to obtain) ---- */
{
  const entries = [
    { id: mkid('tr'), date: '2026-06-15', type: 'invoice', ref: 'TCI/P/26-27/1551', amount: 1021064, dir: +1, side: 'vendor', note: 'Pargaon, 120 cycles — taxable value; verify final invoice total' },
  ]
  for (const p of bankPays(/trinity/i)) {
    entries.push({ id: mkid('tr'), date: p.date, type: 'payment', ref: `[${p.bank}]`, amount: p.amount, dir: -1, side: 'bch', note: 'bank: ' + p.note })
  }
  out.trinity = { opening: null, entries }
}

/* ---- Aoki: append bank debits with no matching thread payment; date-fix provisional rows ---- */
{
  const entries = out.aoki.entries
  const pays = entries.filter((e) => e.type === 'payment')
  const DAY = 86400000
  for (const b of bankPays(/aoki/i)) {
    // nearest-date unconsumed thread payment with same amount
    let best = null
    for (const p of pays) {
      if (p._consumed || p.amount !== b.amount) continue
      const dd = Math.abs(new Date(p.date) - new Date(b.date)) / DAY
      if (!best || dd < best.dd) best = { p, dd }
    }
    if (best) {
      best.p._consumed = true
      if (/TBC/.test(best.p.note || '')) { // provisional Feb/Mar-26 rows — fix from bank
        best.p.note = `date fixed from bank (${b.bank}): ` + b.note
        best.p.date = b.date
      }
    } else {
      entries.push({ id: mkid('ao'), date: b.date, type: 'payment', ref: `[${b.bank}]`, amount: b.amount, dir: -1, side: 'bch', note: 'bank (not yet on AOKI books): ' + b.note })
    }
  }
  pays.forEach((p) => delete p._consumed)
}

/* ---- sort, report, write ---- */
for (const [brand, data] of Object.entries(out)) {
  data.entries.sort((a, b) => a.date.localeCompare(b.date))
  const open = data.opening?.amount || 0
  const closing = data.entries.reduce((s, e) => s + e.dir * e.amount, open)
  const first = data.entries[0]?.date, last = data.entries[data.entries.length - 1]?.date
  data.coverage = `${data.opening ? 'opening ' + data.opening.date : first || '—'} → ${last || '—'}`
  report.push(`${brand}: ${data.entries.length} entries · ${data.coverage} · opening ${open.toLocaleString('en-IN')} · computed closing ${Math.round(closing).toLocaleString('en-IN')}`)
}

const js = '// AUTO-GENERATED by scripts/extract-entries.mjs — do not edit by hand\n' +
  'export const genLedgers = ' + JSON.stringify(out) + '\n'
writeFileSync(fileURLToPath(new URL('../src/entries.gen.js', import.meta.url)), js)
console.log(report.join('\n'))
console.log('Wrote src/entries.gen.js')
