import { seedData, SEED_VERSION } from './seed'

const KEY = 'bch-ledgers-v1'

// v1 states pre-date the generated ledger threads: attach them, keep manual entries.
export function migrate(parsed) {
  if ((parsed.version || 1) >= SEED_VERSION) return parsed
  for (const brand of parsed.brands) {
    const seedBrand = seedData.brands.find((b) => b.id === brand.id)
    if (!seedBrand) continue
    const manual = (brand.entries || []).map((e) => ({
      ...e,
      dir: e.dir ?? entryDir(e.type),
      side: e.side ?? entrySide(e.type),
    }))
    brand.entries = [...(seedBrand.entries || []), ...manual]
    brand.ledger = seedBrand.ledger
  }
  parsed.version = SEED_VERSION
  return parsed
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.brands)) return migrate(parsed)
    }
  } catch (e) {
    console.error('loadState failed', e)
  }
  return structuredClone(seedData)
}

export function saveState(state) {
  const toSave = { ...state, version: SEED_VERSION, savedAt: new Date().toISOString() }
  localStorage.setItem(KEY, JSON.stringify(toSave))
  return toSave
}

export function resetToSeed() {
  localStorage.removeItem(KEY)
  return structuredClone(seedData)
}

export function exportJSON(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bch-ledgers-${today()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function validateImport(obj) {
  if (!obj || typeof obj !== 'object') return 'Not a valid JSON object'
  if (!Array.isArray(obj.brands)) return 'Missing "brands" array'
  for (const b of obj.brands) {
    if (!b.id || !b.name) return 'Each brand needs id and name'
    if (!Array.isArray(b.gaps)) return `Brand ${b.name}: missing gaps array`
  }
  return null
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function daysSince(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

export function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}

export function fmtINR(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

export function fmtLakh(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  if (Math.abs(n) >= 100000) return '₹' + (n / 100000).toFixed(2) + 'L'
  return fmtINR(n)
}

export function gapAmount(g) {
  return g.amtText || (g.amt !== null && g.amt !== undefined ? fmtINR(g.amt) : 'TBD')
}

export const GAP_STATUSES = ['open', 'promised', 'verify', 'resolved', 'rejected']
export const GAP_TYPES = [
  'discount-pending', 'credit-note-pending', 'short-credit', 'dispute',
  'reconciliation-difference', 'documentation-gap', 'balance-unconfirmed',
  'operational-warranty', 'commitment-pending', 'invoice-discrepancy',
]
export const ENTRY_TYPES = ['payment', 'invoice', 'credit-note', 'debit-note', 'discount', 'adjustment', 'note']

// dir: +1 increases what BCH owes, -1 decreases, 0 informational
export function entryDir(type) {
  if (type === 'invoice' || type === 'debit-note') return +1
  if (type === 'note') return 0
  return -1
}
// side: who "sent" this in the conversation — vendor bills/credits, BCH pays
export function entrySide(type) {
  return type === 'payment' ? 'bch' : type === 'debit-note' ? 'bch' : 'vendor'
}

// Running balances for a brand's thread (ascending by date, stable by id).
// Returns { sorted, balances: Map<id, number>, closing }
export function computeThread(brand) {
  const sorted = [...brand.entries].sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
  let bal = brand.ledger?.opening?.amount || 0
  const balances = new Map()
  for (const e of sorted) {
    bal += (e.dir ?? entryDir(e.type)) * (e.amount || 0)
    balances.set(e.id, bal)
  }
  return { sorted, balances, closing: bal }
}

export function openGaps(brand) {
  return brand.gaps.filter((g) => g.status !== 'resolved' && g.status !== 'rejected')
}

export function csvEscape(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// WhatsApp-ready plain-text summary for sharing with the vendor
export function brandSummaryText(brand) {
  const open = openGaps(brand)
  const lines = []
  lines.push(`*${brand.name} — Balance & Open Items* (BCH, ${today()})`)
  lines.push('')
  if (brand.theirBal?.amount != null) lines.push(`Your ledger: ${fmtINR(brand.theirBal.amount)} (${brand.theirBal.label})`)
  if (brand.ourBal?.amount != null) lines.push(`Our net position: ${fmtINR(brand.ourBal.amount)} (${brand.ourBal.label})`)
  if (brand.recov?.text) lines.push(`Pending credits/gaps: ${brand.recov.text}`)
  lines.push('')
  lines.push(`*Open items (${open.length}):*`)
  open.forEach((g) => {
    lines.push(`${g.n}. ${g.title} — ${gapAmount(g)} [${g.status}]`)
    if (g.action) lines.push(`   → ${g.action}`)
  })
  return lines.join('\n')
}
