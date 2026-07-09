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

/* ---- Lucifer: LUCIFER LEDGER.xlsx (BCH-built, both sides) ---- */
{
  const rows = sheetRows('LUCIFER LEDGER.xlsx')
  const entries = []
  let opening = null
  for (const r of rows.slice(5)) {
    if (!r || r.length < 4) continue
    const date = parseDate(r[0])
    if (!date) continue
    const details = r[2] || ''
    const debit = num(r[3]), credit = num(r[4])
    if (/opening/i.test(details)) { opening = { date, amount: debit ?? 0 }; continue }
    if (debit === null && credit === null) continue
    const dir = debit !== null ? +1 : -1
    const type = typeFromLabel(details + ' ' + (r[1] || ''), dir)
    entries.push({ id: mkid('lu'), date, type, ref: r[1] || '', amount: debit ?? credit, dir, side: sideFor(type), note: details !== 'PURCHASE' && details !== 'PAYMENT' ? String(details).trim() : '' })
  }
  out.lucifer = { opening, entries }
}

/* ---- Cultsport: Srinu source xlsx (BCH-built line items, both sides, from 2023) ---- */
{
  const rows = sheetRows('brands/cultsport/CULTSPORT_final (Srinu - source).xlsx')
  const entries = []
  let opening = null
  for (const r of rows.slice(8)) {
    if (!r || r.length < 4) continue
    const date = parseDate(r[0])
    if (!date) continue
    const details = r[2] || ''
    if (/opening/i.test(details)) { opening = { date, amount: num(r[3]) ?? 0 }; continue }
    const debit = num(r[3]), credit = num(r[4])
    if (debit === null && credit === null) continue
    const dir = debit !== null && debit !== 0 ? +1 : -1
    const type = typeFromLabel(details, dir)
    const src = r[6] ? String(r[6]).trim() : ''
    entries.push({ id: mkid('cu'), date, type, ref: r[1] || '', amount: dir > 0 ? debit : credit, dir, side: sideFor(type), note: src })
  }
  out.cultsport = { opening: opening || { date: '2023-01-01', amount: 0 }, entries }
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

/* ---- Trinity: single reviewed invoice ---- */
{
  out.trinity = {
    opening: null,
    entries: [
      { id: mkid('tr'), date: '2026-06-15', type: 'invoice', ref: 'TCI/P/26-27/1551', amount: 1021064, dir: +1, side: 'vendor', note: 'Pargaon, 120 cycles — taxable value; verify final invoice total. 1% CD if paid by 15-Jul-26' },
    ],
  }
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
