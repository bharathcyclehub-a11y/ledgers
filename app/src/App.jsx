import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadState, saveState, resetToSeed, exportJSON, validateImport, migrate,
  today, daysSince, daysUntil, fmtINR, fmtLakh, gapAmount,
  GAP_STATUSES, GAP_TYPES, ENTRY_TYPES, openGaps, downloadCSV, brandSummaryText,
  entryDir, entrySide, computeThread,
} from './store'
import { subscribeSync, initialSync, pullCloud, pushCloud, schedulePush, getSyncKey, setSyncKey } from './sync'

const REVIEW_CADENCE_DAYS = 15

const statusColor = { open: 'red', promised: 'amber', verify: 'blue', resolved: 'green', rejected: '' }

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
  const hash = useHashRoute()

  // pull cloud on launch; adopt if newer than local
  useEffect(() => {
    initialSync(loadState()).then((cloud) => {
      if (cloud) setState(saveState(migrate(cloud)))
    })
  }, [])

  const update = (fn) => {
    setState((prev) => {
      const next = structuredClone(prev)
      fn(next)
      const saved = saveState(next)
      schedulePush(saved)
      return saved
    })
  }

  const m = hash.match(/^#\/brand\/([^/]+)/)
  if (m) {
    const brand = state.brands.find((b) => b.id === m[1])
    if (brand) return <BrandPage brand={brand} update={update} />
  }
  if (hash.startsWith('#/data')) return <DataPage state={state} setState={setState} />
  return <Dashboard state={state} update={update} />
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
      {brands.map((b) => <BrandCard key={b.id} b={b} />)}
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
        <button className={tab === 'gaps' ? 'on' : ''} onClick={() => setTab('gaps')}>Gaps ({openGaps(brand).length})</button>
        <button className={tab === 'share' ? 'on' : ''} onClick={() => setTab('share')}>Share</button>
      </div>

      {tab === 'gaps' && <GapsTab brand={brand} update={update} />}
      {tab === 'ledger' && <LedgerTab brand={brand} update={update} />}
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

function GapsTab({ brand, update }) {
  const [filter, setFilter] = useState('active')
  const [expanded, setExpanded] = useState(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)

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
          <div key={g.n} className={'gap' + (g.status === 'resolved' || g.status === 'rejected' ? ' done' : '')}>
            <div className="top" onClick={() => setExpanded(expanded === g.n ? null : g.n)}>
              <span className="num">{g.n}</span>
              <span className="title">{g.title}</span>
              <span className="amt">{gapAmount(g)}</span>
            </div>
            <div className="meta">
              <span className={'chip ' + (statusColor[g.status] || '')}>{g.status}</span>
              <span className="chip">{g.type}</span>
            </div>
            {expanded === g.n && (
              <div className="detail">
                {g.evidence && <><div className="lbl">Evidence</div><div>{g.evidence}</div></>}
                {g.action && <><div className="lbl">Action</div><div>{g.action}</div></>}
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

function GapForm({ initial, onSave, onCancel }) {
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
      <h3>{initial ? `Edit gap #${initial.n}` : 'New gap'}</h3>
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

function LedgerTab({ brand, update }) {
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)

  const { sorted, balances, closing } = useMemo(() => computeThread(brand), [brand])

  const filtered = useMemo(() => {
    let list = sorted
    if (filter === 'vendor') list = list.filter((e) => (e.side ?? entrySide(e.type)) === 'vendor')
    else if (filter === 'bch') list = list.filter((e) => (e.side ?? entrySide(e.type)) === 'bch')
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

      <div className="filters">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>all</button>
        <button className={filter === 'vendor' ? 'on' : ''} onClick={() => setFilter('vendor')}>← {brand.name}</button>
        <button className={filter === 'bch' ? 'on' : ''} onClick={() => setFilter('bch')}>BCH →</button>
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
                <div className="bubble">
                  <div className="brow">
                    <span className={'chip ' + (dir > 0 ? 'red' : dir < 0 ? 'green' : '')}>{e.type}</span>
                    <span className="bamt" style={{ color: dir > 0 ? 'var(--red)' : dir < 0 ? 'var(--green)' : 'var(--muted)' }}>
                      {dir !== 0 ? (dir > 0 ? '+' : '−') : ''}{fmtINR(e.amount)}
                    </span>
                    <button
                      className="del"
                      onClick={() => {
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
        One shared cloud copy for all your devices. Enter the same sync key on each device — changes push automatically
        (2s after every edit) and pull on launch. Newest save wins.
      </p>
      <div className="form">
        <div>
          <label>Sync key</label>
          <input
            type="password"
            value={key}
            placeholder="enter the sync key"
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
