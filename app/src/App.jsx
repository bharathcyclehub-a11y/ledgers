import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadState, saveState, resetToSeed, exportJSON, validateImport, migrate,
  today, daysSince, daysUntil, fmtINR, fmtLakh, gapAmount,
  GAP_STATUSES, GAP_TYPES, ENTRY_TYPES, openGaps, downloadCSV, brandSummaryText,
  entryDir, entrySide, computeThread,
} from './store'
import { subscribeSync, initialSync, pullCloud, pushCloud, schedulePush, getSyncKey, setSyncKey, verifyPin } from './sync'
import { EVIDENCE } from './evidence.gen'

const REVIEW_CADENCE_DAYS = 15

const statusColor = { open: 'red', promised: 'amber', verify: 'blue', resolved: 'green', rejected: '' }

// Stable, human-referenceable gap IDs — brand code + gap number (e.g. CULT-3, EMOT-12).
const BRAND_CODE = { cultsport: 'CULT', lucifer: 'LUCI', emotorad: 'EMOT', aoki: 'AOKI', raleigh: 'RALE', hornback: 'HORN', trinity: 'TRIN' }
const gapId = (brandId, n) => `${BRAND_CODE[brandId] || String(brandId).slice(0, 4).toUpperCase()}-${n}`

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/')
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export default function App() {
  const [state, setState] = useState(loadState)
  const [locked, setLocked] = useState(() => !getSyncKey())
  const hash = useHashRoute()

  // re-lock if the PIN is invalidated (changed server-side)
  useEffect(() => subscribeSync((s) => { if (s.state === 'nokey' && !getSyncKey()) setLocked(true) }), [])

  // pull cloud after unlock; adopt if newer than local
  useEffect(() => {
    if (locked) return
    initialSync(loadState()).then((cloud) => {
      if (cloud) setState(saveState(migrate(cloud)))
    })
  }, [locked])

  const update = (fn) => {
    setState((prev) => {
      const next = structuredClone(prev)
      fn(next)
      const saved = saveState(next)
      schedulePush(saved)
      return saved
    })
  }

  if (locked) return <PinGate onUnlock={() => setLocked(false)} />

  const m = hash.match(/^#\/brand\/([^/]+)/)
  if (m) {
    const brand = state.brands.find((b) => b.id === m[1])
    if (brand) return <BrandPage brand={brand} update={update} />
  }
  if (hash.startsWith('#/data')) return <DataPage state={state} setState={setState} />
  return <Dashboard state={state} update={update} />
}

/* ---------- PIN gate ---------- */

function PinGate({ onUnlock }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!pin.trim()) return
    setBusy(true); setErr('')
    try {
      if (await verifyPin(pin.trim())) {
        setSyncKey(pin.trim())
        onUnlock()
      } else {
        setErr('Wrong PIN — try again')
        setPin('')
      }
    } catch {
      setErr('Network error — connect to the internet for first unlock')
    }
    setBusy(false)
  }

  return (
    <div className="pingate">
      <div className="pinbox">
        <div className="pinlogo">₹</div>
        <h2>BCH Ledgers</h2>
        <p className="smallmuted">Enter your PIN to unlock</p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="• • • • • •"
        />
        {err && <p className="pinerr">{err}</p>}
        <button className="iconbtn primary" disabled={busy || !pin} onClick={submit}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </div>
    </div>
  )
}

/* ---------- Sync status dot ---------- */

function SyncDot() {
  const [st, setSt] = useState({ state: 'off' })
  useEffect(() => subscribeSync(setSt), [])
  const color = { synced: 'var(--green)', syncing: 'var(--amber)', error: 'var(--red)', nokey: 'var(--muted)', off: 'var(--muted)' }[st.state]
  const label = { synced: 'cloud ✓', syncing: 'syncing…', error: 'sync error', nokey: 'no sync key', off: 'cloud' }[st.state]
  return (
    <a href="#/data" className="syncdot" title={st.error || label}>
      <span className="dot" style={{ background: color }} /> {label}
    </a>
  )
}

/* ---------- Dashboard ---------- */

function Dashboard({ state }) {
  const totalPayable = state.brands.reduce((s, b) => s + (b.theirBal?.amount || 0), 0)
  const totalRecov = state.brands.reduce((s, b) => s + (b.recov?.amount || 0), 0)
  const totalOpen = state.brands.reduce((s, b) => s + openGaps(b).length, 0)

  const deadlines = state.brands
    .filter((b) => b.deadline)
    .map((b) => ({ ...b.deadline, brand: b.name, id: b.id, days: daysUntil(b.deadline.date) }))
    .filter((d) => d.days !== null && d.days > -30)
    .sort((a, b) => a.days - b.days)

  const brands = [...state.brands].sort(
    (a, b) => (daysSince(b.lastReviewed) ?? 999) - (daysSince(a.lastReviewed) ?? 999)
  )

  return (
    <>
      <header className="hdr">
        <h1>BCH Ledgers</h1>
        <SyncDot />
        <a className="iconbtn" href="#/data">Data</a>
      </header>

      <div className="summary">
        <div className="cell"><div className="v">{fmtLakh(totalPayable)}</div><div className="l">Gross payable (brand books)</div></div>
        <div className="cell"><div className="v">{fmtLakh(totalRecov)}</div><div className="l">Quantified recoverable</div></div>
        <div className="cell"><div className="v">{totalOpen}</div><div className="l">Open gaps</div></div>
      </div>

      {deadlines.map((d) => (
        <a key={d.id} href={`#/brand/${d.id}`} style={{ textDecoration: 'none' }}>
          <div className={'alert' + (d.days > 5 ? ' warn' : '')}>
            ⏰ {d.brand}: {d.label} — {d.days < 0 ? `${-d.days}d overdue` : d.days === 0 ? 'TODAY' : `${d.days}d left (${d.date})`}
          </div>
        </a>
      ))}

      <div className="sectiontitle">Brands</div>
      <div className="brandgrid">
        {brands.map((b) => <BrandCard key={b.id} b={b} />)}
      </div>
    </>
  )
}

function BrandCard({ b }) {
  const open = openGaps(b).length
  const ds = daysSince(b.lastReviewed)
  const due = ds !== null && ds >= REVIEW_CADENCE_DAYS
  return (
    <a className="card brandcard" href={`#/brand/${b.id}`}>
      <div className="row1">
        <span className="name">{b.name}</span>
        <span className="bal">{fmtLakh(b.theirBal?.amount)}</span>
      </div>
      <div className="sub">{b.sub}</div>
      <div className="row2">
        {open > 0 ? <span className="chip red">{open} open gaps</span> : <span className="chip green">all clear</span>}
        {b.recov?.amount ? <span className="chip green">recover {fmtLakh(b.recov.amount)}</span> : null}
        <span className={'chip' + (due ? ' amber' : '')}>
          {ds === null ? 'never reviewed' : due ? `review due · ${ds}d ago` : `reviewed ${ds}d ago`}
        </span>
      </div>
    </a>
  )
}

/* ---------- Brand page ---------- */

function BrandPage({ brand, update }) {
  const [tab, setTab] = useState('ledger')
  const [focusGap, setFocusGap] = useState(null)
  const openGapInTab = (n) => { setFocusGap(n); setTab('gaps') }
  const ds = daysSince(brand.lastReviewed)
  const due = ds !== null && ds >= REVIEW_CADENCE_DAYS

  return (
    <>
      <header className="hdr">
        <a className="back" href="#/">‹ Back</a>
        <h1>{brand.name}</h1>
        <button
          className={'iconbtn' + (due ? ' primary' : '')}
          onClick={() => update((s) => { s.brands.find((b) => b.id === brand.id).lastReviewed = today() })}
        >
          {due ? `Review due (${ds}d)` : '✓ Reviewed'}
        </button>
      </header>

      <div className="card">
        <div className="smallmuted" style={{ marginBottom: 8 }}>{brand.sub}</div>
        <div className="balgrid">
          <div className="b">
            <div className="v">{fmtINR(brand.theirBal?.amount)}</div>
            <div className="l">{brand.theirBal?.label || 'Their books'}</div>
          </div>
          <div className="b">
            <div className="v">{fmtINR(brand.ourBal?.amount)}</div>
            <div className="l">{brand.ourBal?.label || 'Our net'}</div>
          </div>
        </div>
        {brand.recov?.text && <div className="recov">↩ {brand.recov.text}</div>}
        {brand.deadline && (
          <div className="alert" style={{ marginTop: 10, marginBottom: 0 }}>
            ⏰ {brand.deadline.label} ({brand.deadline.date})
          </div>
        )}
        <Collapsible label="Position & notes">
          <div className="pos">{brand.position}</div>
          {brand.notes && <div className="pos">{brand.notes}</div>}
        </Collapsible>
      </div>

      <div className="tabs">
        <button className={tab === 'ledger' ? 'on' : ''} onClick={() => setTab('ledger')}>Ledger ({brand.entries.length})</button>
        <button className={tab === 'monthly' ? 'on' : ''} onClick={() => setTab('monthly')}>Monthly</button>
        <button className={tab === 'table' ? 'on' : ''} onClick={() => setTab('table')}>Table</button>
        <button className={tab === 'gaps' ? 'on' : ''} onClick={() => setTab('gaps')}>Gaps ({openGaps(brand).length})</button>
        <button className={tab === 'share' ? 'on' : ''} onClick={() => setTab('share')}>Share</button>
      </div>

      {tab === 'gaps' && <GapsTab brand={brand} update={update} focusGap={focusGap} clearFocus={() => setFocusGap(null)} />}
      {tab === 'ledger' && <LedgerTab brand={brand} update={update} onOpenGap={openGapInTab} />}
      {tab === 'monthly' && <MonthlyTab brand={brand} />}
      {tab === 'table' && <TableTab brand={brand} onOpenGap={openGapInTab} />}
      {tab === 'share' && <ShareTab brand={brand} />}
    </>
  )
}

function Collapsible({ label, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 10 }}>
      <button className="iconbtn" style={{ fontSize: 12 }} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {label}
      </button>
      {open && children}
    </div>
  )
}

/* ---------- Gaps ---------- */

function GapsTab({ brand, update, focusGap, clearFocus }) {
  const [filter, setFilter] = useState('active')
  const [expanded, setExpanded] = useState(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)

  // deep-link from Table/Ledger: jump to a specific gap, expand it, scroll into view
  useEffect(() => {
    if (focusGap == null) return
    setFilter('all')
    setExpanded(focusGap)
    const t = setTimeout(() => {
      const el = document.getElementById('gap-' + focusGap)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 60)
    clearFocus?.()
    return () => clearTimeout(t)
  }, [focusGap])

  const gaps = useMemo(() => {
    let g = [...brand.gaps]
    if (filter === 'active') g = g.filter((x) => x.status !== 'resolved' && x.status !== 'rejected')
    else if (filter !== 'all') g = g.filter((x) => x.status === filter)
    return g
  }, [brand, filter])

  const mutateGap = (n, fn) =>
    update((s) => {
      const b = s.brands.find((x) => x.id === brand.id)
      const g = b.gaps.find((x) => x.n === n)
      if (g) fn(g, b)
    })

  const counts = { active: openGaps(brand).length, all: brand.gaps.length }

  return (
    <>
      <div className="filters">
        {['active', 'all', ...GAP_STATUSES].map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f}{counts[f] !== undefined ? ` (${counts[f]})` : ''}
          </button>
        ))}
      </div>

      <div className="card list">
        {gaps.length === 0 && <div className="empty">No gaps in this view</div>}
        {gaps.map((g) => (
          <div key={g.n} id={'gap-' + g.n} className={'gap' + (g.status === 'resolved' || g.status === 'rejected' ? ' done' : '') + (expanded === g.n ? ' focus' : '')}>
            <div className="top" onClick={() => setExpanded(expanded === g.n ? null : g.n)}>
              <span className="gapid">{gapId(brand.id, g.n)}</span>
              <span className="title">{g.title}</span>
              <span className="amt">{gapAmount(g)}</span>
            </div>
            <div className="meta">
              <span className={'chip ' + (statusColor[g.status] || '')}>{g.status}</span>
              <span className="chip">{g.type}</span>
            </div>
            {expanded === g.n && (
              <div className="detail">
                {g.result && <div className="result"><span className="result-lbl">✓ Result</span> {g.result}</div>}
                {g.evidence && <><div className="lbl">Evidence · reference & chat proof</div><Evidence text={g.evidence} /></>}
                {g.action && <><div className="lbl">Action</div><div>{g.action}</div></>}
                <GapShots brand={brand} n={g.n} />
                {(g.progress || []).map((p, i) => (
                  <div key={i} className="note">{p.date}: {p.text}</div>
                ))}
                <div className="lbl">Set status</div>
                <div className="statusrow">
                  {GAP_STATUSES.map((st) => (
                    <button
                      key={st}
                      className={g.status === st ? 'on' : ''}
                      style={g.status === st ? { borderColor: 'currentColor', color: 'inherit' } : {}}
                      onClick={() => mutateGap(g.n, (x) => {
                        x.status = st
                        if (st === 'resolved') (x.progress ||= []).push({ date: today(), text: 'Marked resolved' })
                      })}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                <ProgressNote onAdd={(text) => mutateGap(g.n, (x) => { (x.progress ||= []).push({ date: today(), text }) })} />
                <div className="statusrow" style={{ marginTop: 8 }}>
                  <button onClick={() => { setEditing(g); setAdding(false) }}>Edit</button>
                  <button
                    style={{ color: 'var(--red)' }}
                    onClick={() => {
                      if (confirm(`Delete gap #${g.n} "${g.title}"?`))
                        update((s) => {
                          const b = s.brands.find((x) => x.id === brand.id)
                          b.gaps = b.gaps.filter((x) => x.n !== g.n)
                        })
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {!adding && !editing && (
        <button className="iconbtn primary reviewbtn" onClick={() => setAdding(true)}>+ Add gap</button>
      )}
      {(adding || editing) && (
        <GapForm
          initial={editing}
          brandId={brand.id}
          onCancel={() => { setAdding(false); setEditing(null) }}
          onSave={(vals) => {
            update((s) => {
              const b = s.brands.find((x) => x.id === brand.id)
              if (editing) {
                const g = b.gaps.find((x) => x.n === editing.n)
                Object.assign(g, vals)
              } else {
                const n = Math.max(0, ...b.gaps.map((x) => x.n)) + 1
                b.gaps.push({ n, ...vals, progress: [{ date: today(), text: 'Added' }] })
              }
            })
            setAdding(false); setEditing(null)
          }}
        />
      )}
    </>
  )
}

function ProgressNote({ onAdd }) {
  const [text, setText] = useState('')
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      <input
        style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }}
        placeholder="Add progress note…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button className="iconbtn" disabled={!text.trim()} onClick={() => { onAdd(text.trim()); setText('') }}>Add</button>
    </div>
  )
}

function GapForm({ initial, onSave, onCancel, brandId }) {
  const [v, setV] = useState(() => ({
    title: initial?.title || '',
    type: initial?.type || GAP_TYPES[0],
    amt: initial?.amt ?? '',
    amtText: initial?.amtText || '',
    status: initial?.status || 'open',
    evidence: initial?.evidence || '',
    action: initial?.action || '',
  }))
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
  return (
    <div className="card form">
      <h3>{initial ? `Edit ${gapId(brandId, initial.n)}` : 'New gap'}</h3>
      <div><label>Title</label><textarea value={v.title} onChange={set('title')} /></div>
      <div className="row">
        <div><label>Type</label>
          <select value={v.type} onChange={set('type')}>{GAP_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        <div><label>Status</label>
          <select value={v.status} onChange={set('status')}>{GAP_STATUSES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
      </div>
      <div className="row">
        <div><label>Amount (₹, number)</label><input type="number" value={v.amt} onChange={set('amt')} placeholder="blank = TBD" /></div>
        <div><label>Amount display (optional)</label><input value={v.amtText} onChange={set('amtText')} placeholder="e.g. 1.3–1.4L / TBD" /></div>
      </div>
      <div><label>Evidence</label><textarea value={v.evidence} onChange={set('evidence')} /></div>
      <div><label>Action</label><textarea value={v.action} onChange={set('action')} /></div>
      <div className="formactions">
        <button className="iconbtn" onClick={onCancel}>Cancel</button>
        <button
          className="iconbtn primary"
          disabled={!v.title.trim()}
          onClick={() => onSave({ ...v, amt: v.amt === '' ? null : Number(v.amt), title: v.title.trim() })}
        >
          Save
        </button>
      </div>
    </div>
  )
}

/* ---------- Ledger: chat-style two-sided thread ---------- */

const PAGE = 80

const AUDIT_LABEL = { ok: '✓ disc ok', short: '⚠ short', missing: '✗ NO DISC', kids: 'kids · 0%', era20: '20% era', info: 'ℹ' }
const AUDIT_CHIP = { ok: 'green', short: 'amber', missing: 'red', kids: '', era20: 'blue', info: 'blue' }

function LedgerTab({ brand, update, onOpenGap }) {
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const { sorted, balances, closing } = useMemo(() => computeThread(brand), [brand])

  // discount audit rollup (entries carry .audit from the consolidation)
  const audit = useMemo(() => {
    const inv = sorted.filter((e) => e.type === 'invoice' && e.audit)
    const by = (s) => inv.filter((e) => e.audit.s === s)
    const gapAmt = (list) => {
      const ns = [...new Set(list.map((e) => e.audit.g).filter(Boolean))]
      return ns.reduce((s, n) => s + (brand.gaps.find((g) => g.n === n)?.amt || 0), 0)
    }
    return inv.length
      ? { total: inv.length, ok: by('ok').length, short: by('short').length, missing: by('missing').length,
          kids: by('kids').length, era20: by('era20').length, missingAmt: gapAmt(by('missing')), shortAmt: gapAmt(by('short')) }
      : null
  }, [sorted, brand])

  const linkedGapNs = useMemo(() => new Set(sorted.flatMap((e) => (e.audit?.g ? [e.audit.g] : []))), [sorted])
  const unlinkedOpenGaps = openGaps(brand).filter((g) => !linkedGapNs.has(g.n))

  const filtered = useMemo(() => {
    let list = sorted
    if (filter === 'vendor') list = list.filter((e) => (e.side ?? entrySide(e.type)) === 'vendor')
    else if (filter === 'bch') list = list.filter((e) => (e.side ?? entrySide(e.type)) === 'bch')
    else if (filter === 'nodisc') list = list.filter((e) => e.audit && (e.audit.s === 'missing' || e.audit.s === 'short'))
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      list = list.filter((e) => `${e.ref} ${e.note} ${e.type} ${e.amount}`.toLowerCase().includes(needle))
    }
    return list
  }, [sorted, filter, q])

  const visible = showAll || filtered.length <= PAGE ? filtered : filtered.slice(-PAGE)
  const hidden = filtered.length - visible.length

  const stated = brand.theirBal?.amount
  const diff = brand.ledger?.matchable && stated != null ? Math.round(closing - stated) : null

  return (
    <>
      {/* Reconciliation bar: computed closing vs their stated figure */}
      <div className="card matchbar">
        <div className="mrow">
          <div className="b">
            <div className="v">{fmtINR(closing)}</div>
            <div className="l">Computed closing ({brand.entries.length} entries)</div>
          </div>
          {brand.ledger?.matchable ? (
            <div className="b" style={{ textAlign: 'right' }}>
              <div className="v" style={{ color: diff === 0 ? 'var(--green)' : 'var(--amber)' }}>
                {diff === 0 ? '✓ MATCHED' : (diff > 0 ? '+' : '−') + fmtINR(Math.abs(diff))}
              </div>
              <div className="l">vs {brand.theirBal?.label}</div>
            </div>
          ) : (
            <div className="b" style={{ textAlign: 'right' }}>
              <div className="v" style={{ color: 'var(--muted)' }}>one-sided</div>
              <div className="l">not comparable yet</div>
            </div>
          )}
        </div>
        {brand.ledger?.note && <div className="covnote">{brand.ledger.note}</div>}
        {brand.ledger?.coverage && <div className="covnote" style={{ marginTop: 2 }}>Coverage: {brand.ledger.coverage}</div>}
      </div>

      {audit && (
        <div className="card auditbar">
          <b>Discount audit — {audit.total} invoices:</b>{' '}
          <span className="chip green">✓ ok {audit.ok}</span>{' '}
          <span className="chip amber">⚠ short {audit.short} ({fmtINR(audit.shortAmt)})</span>{' '}
          <span className="chip red">✗ no disc {audit.missing} ({fmtINR(audit.missingAmt)})</span>{' '}
          {audit.kids > 0 && <span className="chip">kids-0% {audit.kids}</span>}{' '}
          {audit.era20 > 0 && <span className="chip blue">20%-era {audit.era20}</span>}
          <div className="covnote">Tap any entry for its explanation; red/amber invoices carry their gap inline.</div>
        </div>
      )}

      <div className="filters">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>all</button>
        <button className={filter === 'vendor' ? 'on' : ''} onClick={() => setFilter('vendor')}>← {brand.name}</button>
        <button className={filter === 'bch' ? 'on' : ''} onClick={() => setFilter('bch')}>BCH →</button>
        {audit && <button className={filter === 'nodisc' ? 'on' : ''} onClick={() => setFilter('nodisc')}>✗/⚠ discount gaps</button>}
        <input className="search" placeholder="Search ref / note…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="thread">
        {brand.ledger?.opening && (showAll || hidden === 0) && filter === 'all' && !q && (
          <div className="opening">
            Opening balance <b>{fmtINR(brand.ledger.opening.amount)}</b> · {brand.ledger.opening.date}
          </div>
        )}
        {hidden > 0 && (
          <button className="iconbtn reviewbtn" onClick={() => setShowAll(true)}>
            ↑ Show {hidden.toLocaleString('en-IN')} earlier entries (from the beginning)
          </button>
        )}
        {visible.length === 0 && <div className="empty">No entries match</div>}
        {visible.map((e, i) => {
          const side = e.side ?? entrySide(e.type)
          const dir = e.dir ?? entryDir(e.type)
          const prev = visible[i - 1]
          const month = e.date?.slice(0, 7)
          const newMonth = !prev || prev.date?.slice(0, 7) !== month
          return (
            <div key={e.id}>
              {newMonth && <div className="monthsep">{monthLabel(month)}</div>}
              <div className={'msg ' + side}>
                <div className={'bubble' + (e.audit?.s === 'missing' ? ' b-missing' : e.audit?.s === 'short' ? ' b-short' : '')}
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                  <div className="brow">
                    <span className={'chip ' + (dir > 0 ? 'red' : dir < 0 ? 'green' : '')}>{e.type}</span>
                    {e.audit && e.audit.s !== 'info' && <span className={'chip ' + AUDIT_CHIP[e.audit.s]}>{AUDIT_LABEL[e.audit.s]}</span>}
                    <span className="bamt" style={{ color: dir > 0 ? 'var(--red)' : dir < 0 ? 'var(--green)' : 'var(--muted)' }}>
                      {dir !== 0 ? (dir > 0 ? '+' : '−') : ''}{fmtINR(e.amount)}
                    </span>
                    <button
                      className="del"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        if (confirm(`Delete ${e.type} ${e.ref || ''} of ${fmtINR(e.amount)}?`))
                          update((s) => {
                            const b = s.brands.find((x) => x.id === brand.id)
                            b.entries = b.entries.filter((x) => x.id !== e.id)
                          })
                      }}
                    >×</button>
                  </div>
                  {e.ref && <div className="bref">{e.ref}</div>}
                  {e.note && <div className="bnote">{e.note}</div>}
                  {expanded === e.id && <EntryExplain e={e} brand={brand} />}
                  <div className="bfoot">
                    <span>{e.date}</span>
                    <span>bal {fmtLakh(balances.get(e.id))}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {unlinkedOpenGaps.length > 0 && (
        <div className="card gapstrip">
          <h3>Open gaps not tied to a single bill ({unlinkedOpenGaps.length})</h3>
          {unlinkedOpenGaps.map((g) => (
            <div key={g.n} className="minigap" onClick={() => setExpanded(expanded === 'gap' + g.n ? null : 'gap' + g.n)}>
              <div className="mg-row">
                <span className="gapid">{gapId(brand.id, g.n)}</span>
                <span className="mg-title">{g.title}</span>
                <span className={'chip ' + (statusColor[g.status] || '')}>{g.status}</span>
                <span className="mg-amt">{gapAmount(g)}</span>
              </div>
              {expanded === 'gap' + g.n && (
                <div className="mg-detail">
                  {g.evidence && <div><b>Evidence:</b> {g.evidence}</div>}
                  {g.action && <div><b>Action:</b> {g.action}</div>}
                  {(g.progress || []).map((p, j) => <div key={j} className="gd-note">{p.date}: {p.text}</div>)}
                  {onOpenGap && (
                    <button className="iconbtn primary gd-open" onClick={(ev) => { ev.stopPropagation(); onOpenGap(g.n) }}>
                      Open full gap (edit / history) →
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="covnote">Full editing in the Gaps tab — this strip keeps them visible inside the ledger.</div>
        </div>
      )}

      {!adding && <button className="iconbtn primary reviewbtn" onClick={() => setAdding(true)}>+ Add entry</button>}
      {adding && (
        <EntryForm
          onCancel={() => setAdding(false)}
          onSave={(vals) => {
            update((s) => {
              const b = s.brands.find((x) => x.id === brand.id)
              b.entries.push({
                id: 'man-' + Math.random().toString(36).slice(2, 10),
                ...vals,
                dir: entryDir(vals.type),
                side: entrySide(vals.type),
              })
            })
            setAdding(false)
          }}
        />
      )}

      <BalanceEditor brand={brand} update={update} />
    </>
  )
}

// Tap-to-explain: what this entry is + its audit verdict + the linked gap card
function EntryExplain({ e, brand, onOpenGap }) {
  const TYPE_EXPLAIN = {
    invoice: `${brand.name} billed BCH — increases what BCH owes`,
    payment: `BCH paid ${brand.name} — reduces the balance`,
    'credit-note': `${brand.name} credited BCH (return/CN) — reduces the balance`,
    discount: `Discount journal passed by ${brand.name} — reduces the balance`,
    'debit-note': 'Debit raised — increases the balance',
    adjustment: 'Journal adjustment — reduces the balance',
    note: 'Informational note',
  }
  const gap = e.audit?.g ? brand.gaps.find((g) => g.n === e.audit.g) : null
  return (
    <div className="bexplain">
      <div className="bx-type">{TYPE_EXPLAIN[e.type] || e.type}</div>
      {e.audit && <div className={'auditline a-' + e.audit.s}>{e.audit.t}</div>}
      {gap && (
        <div className="gapinline" onClick={(ev) => { if (onOpenGap) { ev.stopPropagation(); onOpenGap(gap.n) } }} style={onOpenGap ? { cursor: 'pointer' } : undefined}>
          <b>{gapId(brand.id, gap.n)}</b> <span className={'chip ' + (statusColor[gap.status] || '')}>{gap.status}</span> {gapAmount(gap)}
          <div>{gap.title}</div>
          {gap.action && <div className="bx-action">→ {gap.action}</div>}
          {onOpenGap && <div className="bx-action" style={{ color: 'var(--blue)' }}>Open full gap →</div>}
        </div>
      )}
    </div>
  )
}

// Render a curated evidence string with its chat dates, L-line refs and "quotes" highlighted,
// split into labelled source blocks (CHAT / ACCOUNTS-GROUP / OWNER / REVERSE-CALC).
function Evidence({ text }) {
  if (!text) return null
  const parts = text.split(/(?=\bCHAT:|\bACCOUNTS-GROUP:|\bOWNER\b|\bREVERSE-CALC:)/g).map((s) => s.trim()).filter(Boolean)
  const blocks = parts.length ? parts : [text]
  const hl = (s, ki) => {
    // highlight "quotes", L<line> refs, and dates (DD-Mon-YY / DD/MM/YY)
    const re = /("[^"]*"|'[^']*'|L\d+(?:\s*[→\-/,]\s*\d+)*|\b\d{1,2}[-/](?:[A-Za-z]{3,}|\d{1,2})[-/]\d{2,4}\b)/g
    const out = []; let last = 0; let m; let idx = 0
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index))
      const tok = m[0]
      const cls = tok[0] === '"' || tok[0] === "'" ? 'ev-q' : /^L\d/.test(tok) ? 'ev-ref' : 'ev-date'
      out.push(<span key={`${ki}-${idx++}`} className={cls}>{tok}</span>)
      last = m.index + tok.length
    }
    if (last < s.length) out.push(s.slice(last))
    return out
  }
  return (
    <div className="evblocks">
      {blocks.map((b, i) => {
        const mk = b.match(/^(CHAT:|ACCOUNTS-GROUP:|REVERSE-CALC:|OWNER[^:]{0,18}:?)/)
        const label = mk ? mk[1].replace(/:$/, '') : null
        const body = mk ? b.slice(mk[1].length).trim() : b
        return (
          <div key={i} className="evline">
            {label && <span className="ev-tag">{label}</span>}
            <span>{hl(body, i)}</span>
          </div>
        )
      })}
    </div>
  )
}

// Screenshot evidence for a gap: thumbnails with date + source + what-it-proves, tap to zoom.
function GapShots({ brand, n }) {
  const [zoom, setZoom] = useState(null)
  const shots = EVIDENCE[brand.id]?.[n]
  if (!shots || !shots.length) return null
  return (
    <div className="gd-sec">
      <span className="gd-lbl">Screenshots ({shots.length})</span>
      <div className="shots">
        {shots.map((s, i) => (
          s.doc ? (
            <a key={i} className="shot doc" href={`/evidence/${brand.id}/${s.file}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              <div className="docicon">📄 PDF</div>
              <figcaption><b>{s.date}</b> · {s.source}<span>{s.note}</span></figcaption>
            </a>
          ) : (
            <figure key={i} className="shot" onClick={(e) => { e.stopPropagation(); setZoom(s) }}>
              <img src={`/evidence/${brand.id}/${s.file}`} alt={s.note} loading="lazy" />
              <figcaption><b>{s.date}</b> · {s.source}<span>{s.note}</span></figcaption>
            </figure>
          )
        ))}
      </div>
      {zoom && (
        <div className="lightbox" onClick={(e) => { e.stopPropagation(); setZoom(null) }}>
          <img src={`/evidence/${brand.id}/${zoom.file}`} alt={zoom.note} />
          <div className="lb-cap"><b>{zoom.date}</b> · {zoom.source} — {zoom.note}</div>
          <div className="lb-close">tap anywhere to close</div>
        </div>
      )}
    </div>
  )
}

function monthLabel(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[Number(m) - 1]} ${y}`
}

function EntryForm({ onSave, onCancel }) {
  const [v, setV] = useState({ date: today(), type: 'payment', ref: '', amount: '', note: '' })
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
  return (
    <div className="card form">
      <h3>New entry</h3>
      <div className="row">
        <div><label>Date</label><input type="date" value={v.date} onChange={set('date')} /></div>
        <div><label>Type</label>
          <select value={v.type} onChange={set('type')}>{ENTRY_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
      </div>
      <div className="row">
        <div><label>Amount (₹)</label><input type="number" value={v.amount} onChange={set('amount')} /></div>
        <div><label>Ref / txn ID</label><input value={v.ref} onChange={set('ref')} placeholder="UTR, invoice no., CN no." /></div>
      </div>
      <div><label>Note</label><input value={v.note} onChange={set('note')} /></div>
      <div className="formactions">
        <button className="iconbtn" onClick={onCancel}>Cancel</button>
        <button
          className="iconbtn primary"
          disabled={v.type !== 'note' && v.amount === ''}
          onClick={() => onSave({ ...v, amount: v.amount === '' ? null : Number(v.amount) })}
        >
          Save
        </button>
      </div>
    </div>
  )
}

function BalanceEditor({ brand, update }) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState({
    their: brand.theirBal?.amount ?? '',
    theirLabel: brand.theirBal?.label || '',
    our: brand.ourBal?.amount ?? '',
    ourLabel: brand.ourBal?.label || '',
  })
  if (!open) {
    return <button className="iconbtn reviewbtn" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>Update balances</button>
  }
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
  return (
    <div className="card form" style={{ marginTop: 8 }}>
      <h3>Update balances</h3>
      <div className="row">
        <div><label>Their books (₹)</label><input type="number" value={v.their} onChange={set('their')} /></div>
        <div><label>Label / as-of</label><input value={v.theirLabel} onChange={set('theirLabel')} /></div>
      </div>
      <div className="row">
        <div><label>Our net (₹)</label><input type="number" value={v.our} onChange={set('our')} /></div>
        <div><label>Label</label><input value={v.ourLabel} onChange={set('ourLabel')} /></div>
      </div>
      <div className="formactions">
        <button className="iconbtn" onClick={() => setOpen(false)}>Cancel</button>
        <button
          className="iconbtn primary"
          onClick={() => {
            update((s) => {
              const b = s.brands.find((x) => x.id === brand.id)
              b.theirBal = { amount: v.their === '' ? null : Number(v.their), label: v.theirLabel }
              b.ourBal = { amount: v.our === '' ? null : Number(v.our), label: v.ourLabel }
            })
            setOpen(false)
          }}
        >
          Save
        </button>
      </div>
    </div>
  )
}

/* ---------- Monthly view: opening & closing balance per month ----------
   Buckets every entry into its calendar month, carries the running balance
   forward (prev month's close = next month's open) so each month can be
   verified in isolation against the vendor's month-end figure. */

function MonthlyTab({ brand }) {
  const [openMonth, setOpenMonth] = useState(null)

  const { months, opening, closing } = useMemo(() => {
    const asc = [...brand.entries].sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
    const opening = brand.ledger?.opening?.amount || 0
    const map = new Map()
    for (const e of asc) {
      const ym = (e.date || '').slice(0, 7)
      if (!ym) continue
      const g = map.get(ym) || { ym, purchase: 0, payment: 0, credit: 0, entries: [] }
      if (e.type === 'invoice' || e.type === 'debit-note') g.purchase += e.amount || 0
      else if (e.type === 'payment') g.payment += e.amount || 0
      else if (e.type !== 'note') g.credit += e.amount || 0
      g.entries.push(e)
      map.set(ym, g)
    }
    let bal = opening
    const months = [...map.values()].sort((a, b) => a.ym.localeCompare(b.ym))
    for (const m of months) {
      m.open = bal
      m.net = m.purchase - m.payment - m.credit
      bal += m.net
      m.close = bal
    }
    return { months, opening, closing: bal }
  }, [brand])

  const view = [...months].reverse() // newest month on top
  const openDate = brand.ledger?.opening?.date

  const exportCsv = () =>
    downloadCSV(`${brand.id}-monthly-${today()}.csv`, [
      ['Month', 'Opening', 'Purchases', 'Payments', 'Credits/Disc', 'Net', 'Closing', 'Entries'],
      ...months.map((m) => [monthLabel(m.ym), Math.round(m.open), Math.round(m.purchase), Math.round(m.payment), Math.round(m.credit), Math.round(m.net), Math.round(m.close), m.entries.length]),
    ])

  if (months.length === 0)
    return <div className="card"><div className="empty">No dated ledger entries to bucket by month yet.</div></div>

  return (
    <>
      <div className="card matchbar">
        <div className="mrow">
          <div className="b"><div className="v">{fmtINR(opening)}</div><div className="l">Opening {openDate ? `· ${openDate}` : ''}</div></div>
          <div className="b" style={{ textAlign: 'right' }}><div className="v">{fmtINR(closing)}</div><div className="l">Closing · {months.length} months</div></div>
        </div>
        <div className="covnote">Each month carries forward: previous month's closing = next month's opening. Tap a month to see its transactions and verify against the vendor's month-end figure.</div>
      </div>

      <div className="tablewrap card">
        <table className="ltable">
          <thead>
            <tr><th>Month</th><th>Opening</th><th>Purchases</th><th>Payments</th><th>Credits</th><th>Closing</th></tr>
          </thead>
          <tbody>
            {view.flatMap((m) => {
              const isOpen = openMonth === m.ym
              const els = [
                <tr key={m.ym} className="clickable" onClick={() => setOpenMonth(isOpen ? null : m.ym)}>
                  <td className="td-ref"><span className="gapcaret">{isOpen ? '▾' : '▸'}</span>{monthLabel(m.ym)}<div className="td-sub2">{m.entries.length} entries</div></td>
                  <td className="num">{fmtINR(m.open)}</td>
                  <td className="num red">{m.purchase ? fmtINR(m.purchase) : ''}</td>
                  <td className="num green">{m.payment ? fmtINR(m.payment) : ''}</td>
                  <td className="num green">{m.credit ? fmtINR(m.credit) : ''}</td>
                  <td className="num"><b>{fmtINR(m.close)}</b></td>
                </tr>,
              ]
              if (isOpen) {
                els.push(
                  <tr key={m.ym + '-d'} className="gapdetailrow">
                    <td colSpan={6}>
                      <div className="monthdetail">
                        <div className="md-bal"><span>Opening <b>{fmtINR(m.open)}</b></span><span>Closing <b>{fmtINR(m.close)}</b></span></div>
                        {[...m.entries].sort((a, b) => b.date.localeCompare(a.date)).map((e) => {
                          const dir = e.dir ?? entryDir(e.type)
                          return (
                            <div key={e.id} className="md-entry">
                              <span className="md-date">{e.date}</span>
                              <span className={'chip ' + (dir > 0 ? 'red' : dir < 0 ? 'green' : '')}>{e.type}</span>
                              <span className="md-ref">{e.ref || e.note || ''}</span>
                              <span className="md-amt" style={{ color: dir > 0 ? 'var(--red)' : dir < 0 ? 'var(--green)' : 'var(--muted)' }}>
                                {dir !== 0 ? (dir > 0 ? '+' : '−') : ''}{fmtINR(e.amount)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                )
              }
              return els
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="td-ref">TOTAL</td>
              <td className="num">{fmtINR(opening)}</td>
              <td className="num red">{fmtINR(months.reduce((s, m) => s + m.purchase, 0))}</td>
              <td className="num green">{fmtINR(months.reduce((s, m) => s + m.payment, 0))}</td>
              <td className="num green">{fmtINR(months.reduce((s, m) => s + m.credit, 0))}</td>
              <td className="num">{fmtINR(closing)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <button className="iconbtn reviewbtn" onClick={exportCsv}>Export monthly CSV</button>
    </>
  )
}

/* ---------- Table view: Purchase | Payment | Discount | Gap | Balance ----------
   Formula: ΣPurchase − ΣPayment − ΣDiscount = their-books balance; − ΣGap = TRUE PAYABLE.
   Recorded credits sit in Discount (their ledger); un-recorded claims sit in Gap (our ledger).
   Objective: drive every Gap → 0 by getting it recorded (it then moves to Discount). */

function TableTab({ brand, onOpenGap }) {
  const [open, setOpen] = useState(null) // 'g<n>' for a gap row, 'e<id>' for an entry row
  const { rows, totals } = useMemo(() => {
    const col = (e) => (e.type === 'invoice' || e.type === 'debit-note' ? 'purchase' : e.type === 'payment' ? 'payment' : e.type === 'note' ? null : 'discount')
    // ascending entries with running their-books balance
    const asc = [...brand.entries].sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
    let bal = brand.ledger?.opening?.amount || 0
    const entryRows = []
    for (const e of asc) {
      const c = col(e)
      if (!c) continue
      bal += (e.dir ?? entryDir(e.type)) * (e.amount || 0)
      entryRows.push({ kind: 'entry', eid: e.id, e, date: e.date, ref: e.ref, label: e.note, [c]: e.amount, balance: bal, audit: e.audit })
    }
    // gap rows: anchor to linked invoice date (via audit) else brand.updated
    const anchorFor = (g) => {
      const linked = asc.find((e) => e.audit?.g === g.n)
      return linked ? linked.date : brand.updated || '2026-07-13'
    }
    const gapRows = openGaps(brand)
      .filter((g) => g.amt)
      .map((g) => ({ kind: 'gap', n: g.n, g, date: anchorFor(g), ref: gapId(brand.id, g.n), label: g.title, gap: g.amt, status: g.status, tier: g.tier || 'firm' }))
    const all = [...entryRows, ...gapRows].sort((a, b) => b.date.localeCompare(a.date) || (a.kind === 'gap' ? -1 : 1))
    const tierSum = (t) => gapRows.filter((r) => r.tier === t).reduce((s, r) => s + (r.gap || 0), 0)
    const t = {
      purchase: entryRows.reduce((s, r) => s + (r.purchase || 0), 0),
      payment: entryRows.reduce((s, r) => s + (r.payment || 0), 0),
      discount: entryRows.reduce((s, r) => s + (r.discount || 0), 0),
      gap: gapRows.reduce((s, r) => s + (r.gap || 0), 0),
      gapFirm: tierSum('firm'), gapCond: tierSum('conditional'), gapLev: tierSum('leverage'), gapVerify: tierSum('verify'),
      opening: brand.ledger?.opening?.amount || 0,
      closing: bal,
    }
    return { rows: all, totals: t }
  }, [brand])

  const settleTarget = totals.closing - totals.gapFirm     // realistic (verify NOT deducted)
  const bestCase = settleTarget - totals.gapCond            // + conditional conceded to you
  const floor = bestCase - totals.gapLev                    // + leverage won (long-shot)
  const hasTiers = totals.gapCond > 0 || totals.gapLev > 0 || totals.gapVerify > 0

  const exportCsv = () =>
    downloadCSV(`${brand.id}-table-${today()}.csv`, [
      ['Date', 'Ref', 'Purchase', 'Payment', 'Discount', 'Gap', 'Balance', 'Detail'],
      ...rows.map((r) => [r.date, r.ref, r.purchase || '', r.payment || '', r.discount || '', r.gap || '', r.kind === 'entry' ? Math.round(r.balance) : '', r.label || '']),
      [], ['TOTALS', '', Math.round(totals.purchase), Math.round(totals.payment), Math.round(totals.discount), Math.round(totals.gap), '', ''],
      ['THEIR BOOKS BALANCE', '', '', '', '', '', Math.round(totals.closing), 'opening ' + totals.opening + ' + purchases − payments − discounts'],
      ['SETTLE AT (− firm gaps)', '', '', '', '', '', Math.round(settleTarget), 'their books − firm gaps'],
    ])

  return (
    <>
      <div className="card matchbar">
        <div className="ladder">
          <div className="lrow"><span>Their books (Purchase − Payment − Discount)</span><b>{fmtINR(totals.closing)}</b></div>
          <div className="lrow sub"><span>− Firm gaps (high-confidence claims)</span><b className="green">− {fmtINR(totals.gapFirm)}</b></div>
          <div className="lrow target"><span>= SETTLE AT (realistic target)</span><b>{fmtINR(settleTarget)}</b></div>
          {totals.gapCond > 0 && <div className="lrow sub"><span>− Conditional (kids bills, likely conceded)</span><b className="muted">− {fmtINR(totals.gapCond)}</b></div>}
          {totals.gapCond > 0 && <div className="lrow"><span>= Best case</span><b>{fmtINR(bestCase)}</b></div>}
          {totals.gapLev > 0 && <div className="lrow sub"><span>− Leverage upside (long-shot claims)</span><b className="muted">− {fmtINR(totals.gapLev)}</b></div>}
          {totals.gapLev > 0 && <div className="lrow floor"><span>= Aggressive floor (only if you win everything)</span><b>{fmtINR(floor)}</b></div>}
          {totals.gapVerify > 0 && <div className="lrow verify"><span>⚠ Separately: {fmtINR(totals.gapVerify)} in figures to INVESTIGATE (balances/errors — not deducted, not money you're owed)</span></div>}
        </div>
        <div className="covnote">
          {hasTiers
            ? 'Settle at the realistic target. Firm = what the vendor will actually post; conditional & leverage are negotiating room; verify = discrepancies to chase, not recoverables.'
            : 'Purchase − Payment − Discount − Gaps. Every gap told → recorded → moves to Discount → Gap hits zero.'}
        </div>
      </div>

      <div className="tablewrap card">
        <table className="ltable">
          <thead>
            <tr><th>Date</th><th>Ref</th><th>Purchase</th><th>Payment</th><th>Discount</th><th>Gap</th><th>Balance</th></tr>
          </thead>
          <tbody>
            {rows.flatMap((r, i) => {
              const isGap = r.kind === 'gap'
              const key = isGap ? 'g' + r.n : 'e' + r.eid
              const isOpen = open === key
              const els = [
                <tr
                  key={i}
                  className={(isGap ? 'gaprow tier-' + r.tier + ' ' : '') + 'clickable' + (isOpen ? ' rowopen' : '')}
                  onClick={() => setOpen(isOpen ? null : key)}
                >
                  <td className="td-date"><span className="gapcaret">{isOpen ? '▾' : '▸'}</span>{r.date}</td>
                  <td className="td-ref">
                    {r.ref || <span className="td-plain">{(r.label || r.e?.type || '').slice(0, 40)}</span>}
                    {isGap && <span className="tiertag">{r.tier}</span>}
                    {isGap && <div className="td-sub">{(r.label || '').slice(0, 55)}</div>}
                    {!isGap && r.ref && r.label && <div className="td-sub2">{(r.label || '').slice(0, 55)}</div>}
                  </td>
                  <td className="num red">{r.purchase ? fmtINR(r.purchase) : ''}</td>
                  <td className="num green">{r.payment ? fmtINR(r.payment) : ''}</td>
                  <td className="num green">{r.discount ? fmtINR(r.discount) : ''}</td>
                  <td className="num amber">{r.gap ? fmtINR(r.gap) : ''}</td>
                  <td className="num">{r.kind === 'entry' ? fmtINR(r.balance) : ''}</td>
                </tr>,
              ]
              if (isOpen && isGap) {
                const g = r.g
                els.push(
                  <tr key={i + '-d'} className="gapdetailrow">
                    <td colSpan={7}>
                      <div className="gapdetail">
                        <div className="gd-head">
                          <b>{gapId(brand.id, g.n)}</b>
                          <span className={'chip ' + (statusColor[g.status] || '')}>{g.status}</span>
                          <span className="chip">{g.type}</span>
                          <span className="gd-amt">{gapAmount(g)}</span>
                        </div>
                        <div className="gd-title">{g.title}</div>
                        {g.result && <div className="result"><span className="result-lbl">✓ Result</span> {g.result}</div>}
                        {g.evidence && <div className="gd-sec"><span className="gd-lbl">Evidence · reference & chat proof</span><Evidence text={g.evidence} /></div>}
                        {g.action && <div className="gd-sec"><span className="gd-lbl">Action</span>{g.action}</div>}
                        <GapShots brand={brand} n={g.n} />
                        {(g.progress || []).length > 0 && (
                          <div className="gd-sec">
                            <span className="gd-lbl">History ({(g.progress || []).length})</span>
                            {(g.progress || []).map((p, j) => <div key={j} className="gd-note"><b>{p.date}</b> — {p.text}</div>)}
                          </div>
                        )}
                        {onOpenGap && (
                          <button className="iconbtn primary gd-open" onClick={(ev) => { ev.stopPropagation(); onOpenGap(g.n) }}>
                            Open full gap (edit / history) →
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              }
              if (isOpen && !isGap) {
                els.push(
                  <tr key={i + '-d'} className="gapdetailrow">
                    <td colSpan={7}>
                      <div className="entrydetail">
                        <EntryExplain e={r.e} brand={brand} onOpenGap={onOpenGap} />
                        <div className="ed-foot">Posted {r.date} · running balance {fmtINR(r.balance)}</div>
                      </div>
                    </td>
                  </tr>
                )
              }
              return els
            })}
            {totals.opening > 0 && (
              <tr className="openrow"><td className="td-date"></td><td className="td-ref">OPENING</td><td /><td /><td /><td /><td className="num">{fmtINR(totals.opening)}</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td /><td className="td-ref">TOTALS</td>
              <td className="num red">{fmtINR(totals.purchase)}</td>
              <td className="num green">{fmtINR(totals.payment)}</td>
              <td className="num green">{fmtINR(totals.discount)}</td>
              <td className="num amber">{fmtINR(totals.gap)}</td>
              <td className="num">{fmtINR(totals.closing)}</td>
            </tr>
            <tr className="truerow">
              <td colSpan={6} className="td-ref" style={{ textAlign: 'right' }}>− Firm gaps ({fmtINR(totals.gapFirm)}) = SETTLE AT</td>
              <td className="num" style={{ color: 'var(--green)', fontWeight: 700 }}>{fmtINR(settleTarget)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <button className="iconbtn reviewbtn" onClick={exportCsv}>Export table CSV</button>
    </>
  )
}

/* ---------- Share ---------- */

function ShareTab({ brand }) {
  const text = brandSummaryText(brand)
  const [copied, setCopied] = useState(false)
  return (
    <div className="card share">
      <h3>Vendor summary (WhatsApp-ready)</h3>
      <p className="smallmuted">Open items with amounts and asks — paste straight into the chat with {brand.name}.</p>
      <pre>{text}</pre>
      <div className="formactions">
        <button
          className="iconbtn primary"
          onClick={async () => {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? '✓ Copied' : 'Copy text'}
        </button>
        <button
          className="iconbtn"
          onClick={() =>
            downloadCSV(`${brand.id}-gaps-${today()}.csv`, [
              ['#', 'Title', 'Type', 'Amount', 'Status', 'Evidence', 'Action'],
              ...brand.gaps.map((g) => [g.n, g.title, g.type, g.amtText || (g.amt ?? 'TBD'), g.status, g.evidence, g.action]),
            ])
          }
        >
          Gaps CSV
        </button>
        {brand.entries.length > 0 && (
          <button
            className="iconbtn"
            onClick={() =>
              downloadCSV(`${brand.id}-entries-${today()}.csv`, [
                ['Date', 'Type', 'Ref', 'Amount', 'Note'],
                ...brand.entries.map((e) => [e.date, e.type, e.ref, e.amount, e.note]),
              ])
            }
          >
            Entries CSV
          </button>
        )}
      </div>
    </div>
  )
}

/* ---------- Data (export / import) ---------- */

function CloudSyncCard({ state, setState }) {
  const [key, setKey] = useState(getSyncKey())
  const [st, setSt] = useState({ state: 'off' })
  const [busy, setBusy] = useState(false)
  useEffect(() => subscribeSync(setSt), [])

  return (
    <div className="card">
      <h3>Cloud sync</h3>
      <p className="smallmuted">
        One shared cloud copy for all your devices, locked by your PIN (entered at the lock screen). Changes push
        automatically (2s after every edit) and pull on launch. Newest save wins.
      </p>
      <div className="form">
        <div>
          <label>PIN</label>
          <input
            type="password"
            inputMode="numeric"
            value={key}
            placeholder="enter the PIN"
            onChange={(e) => setKey(e.target.value)}
            onBlur={() => setSyncKey(key)}
          />
        </div>
      </div>
      <div className="formactions" style={{ marginTop: 10 }}>
        <button
          className="iconbtn primary"
          disabled={busy || !key}
          onClick={async () => {
            setSyncKey(key); setBusy(true)
            try {
              const cloud = await pullCloud()
              if (!cloud) alert('Cloud is empty — use "Push to cloud" to seed it from this device.')
              else if (confirm(`Cloud copy saved ${String(cloud.savedAt).slice(0, 16).replace('T', ' ')}. Replace this device's data with it?`)) {
                setState(saveState(migrate(cloud)))
                alert('Pulled ✓')
              }
            } catch (e) { alert('Pull failed: ' + e.message) }
            setBusy(false)
          }}
        >
          Pull from cloud
        </button>
        <button
          className="iconbtn"
          disabled={busy || !key}
          onClick={async () => {
            setSyncKey(key); setBusy(true)
            try { await pushCloud(state); alert('Pushed ✓ — this device is now the cloud version') }
            catch (e) { alert('Push failed: ' + e.message) }
            setBusy(false)
          }}
        >
          Push to cloud
        </button>
      </div>
      {st.state === 'error' && <p className="smallmuted" style={{ color: 'var(--red)' }}>Last error: {st.error}</p>}
      {st.at && <p className="smallmuted">Last sync: {String(st.at).slice(0, 19).replace('T', ' ')}</p>}
    </div>
  )
}

function DataPage({ state, setState }) {
  const fileRef = useRef()
  const totalGaps = state.brands.reduce((s, b) => s + b.gaps.length, 0)
  const totalEntries = state.brands.reduce((s, b) => s + b.entries.length, 0)

  return (
    <>
      <header className="hdr">
        <a className="back" href="#/">‹ Back</a>
        <h1>Data</h1>
        <SyncDot />
      </header>

      <CloudSyncCard state={state} setState={setState} />

      <div className="card">
        <h3>Manual backup</h3>
        <p className="smallmuted">
          Cloud sync above keeps devices in step automatically. Export is your offline backup — take one before big
          clean-ups, and import restores it anywhere.
        </p>
        <p className="smallmuted">
          {state.brands.length} brands · {totalGaps} gaps · {totalEntries} entries · last saved {String(state.savedAt).slice(0, 10)}
        </p>
        <div className="formactions">
          <button className="iconbtn primary" onClick={() => exportJSON(state)}>Export JSON</button>
          <button className="iconbtn" onClick={() => fileRef.current.click()}>Import JSON</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files[0]
            if (!file) return
            try {
              const obj = JSON.parse(await file.text())
              const err = validateImport(obj)
              if (err) return alert('Import failed: ' + err)
              const gapCount = obj.brands.reduce((s, b) => s + b.gaps.length, 0)
              if (confirm(`Replace current data with "${file.name}"?\n${obj.brands.length} brands, ${gapCount} gaps.\nThis overwrites everything on this device.`)) {
                setState(saveState(migrate(obj)))
                alert('Imported ✓ (use "Push to cloud" above to make this the shared version)')
              }
            } catch {
              alert('Import failed: not valid JSON')
            } finally {
              e.target.value = ''
            }
          }}
        />
      </div>

      <div className="card">
        <h3>Danger zone</h3>
        <p className="smallmuted">Restore the original seeded dataset (registers as of 07-Jul-2026). All edits on this device are lost.</p>
        <button
          className="iconbtn danger"
          onClick={() => {
            if (confirm('Reset ALL data to the original seed? Your edits will be lost. Export first if unsure.'))
              setState(resetToSeed())
          }}
        >
          Reset to seed data
        </button>
      </div>
    </>
  )
}
