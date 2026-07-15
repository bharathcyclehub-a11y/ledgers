// Cloud sync client: pull-on-load, debounced push-on-change, last-write-wins by savedAt.
const KEY_STORAGE = 'bch-sync-key'

let status = { state: 'off', at: null, error: null } // off | syncing | synced | error | nokey
const listeners = new Set()
export function subscribeSync(fn) {
  listeners.add(fn)
  fn(status)
  return () => listeners.delete(fn)
}
function setStatus(s) {
  status = { ...status, ...s }
  listeners.forEach((fn) => fn(status))
}
export function getSyncStatus() { return status }

export function getSyncKey() { return localStorage.getItem(KEY_STORAGE) || '' }
export function setSyncKey(k) {
  if (k) localStorage.setItem(KEY_STORAGE, k.trim())
  else localStorage.removeItem(KEY_STORAGE)
  setStatus({ state: k ? 'off' : 'nokey' })
}

async function call(method, body) {
  const key = getSyncKey()
  if (!key) throw Object.assign(new Error('No PIN set'), { nokey: true })
  const res = await fetch('/api/state', {
    method,
    headers: { 'x-sync-key': key, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    // PIN changed server-side — clear it so the lock screen reappears
    setSyncKey('')
    throw Object.assign(new Error('PIN no longer valid'), { nokey: true })
  }
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`sync ${method} failed: ${res.status} ${(await res.text()).slice(0, 120)}`)
  return res.json()
}

// Validate a candidate PIN against the server. true = valid (even if cloud empty).
export async function verifyPin(pin) {
  const res = await fetch('/api/state', { headers: { 'x-sync-key': pin } })
  return res.status !== 401
}

export async function pullCloud() {
  setStatus({ state: 'syncing', error: null })
  try {
    const data = await call('GET')
    setStatus({ state: 'synced', at: new Date().toISOString() })
    return data
  } catch (e) {
    setStatus({ state: e.nokey ? 'nokey' : 'error', error: e.message })
    throw e
  }
}

export async function pushCloud(state) {
  setStatus({ state: 'syncing', error: null })
  try {
    await call('PUT', state)
    setStatus({ state: 'synced', at: new Date().toISOString() })
  } catch (e) {
    setStatus({ state: e.nokey ? 'nokey' : 'error', error: e.message })
    throw e
  }
}

let timer = null
export function schedulePush(state) {
  if (!getSyncKey()) return
  clearTimeout(timer)
  timer = setTimeout(() => pushCloud(state).catch(() => {}), 2000)
}

// Startup reconcile: newer savedAt wins.
export async function initialSync(localState) {
  if (!getSyncKey()) { setStatus({ state: 'nokey' }); return null }
  try {
    const cloud = await pullCloud()
    if (!cloud) { await pushCloud(localState); return null } // first device seeds the cloud
    const cloudAt = String(cloud.savedAt || '')
    const localAt = String(localState.savedAt || '')
    if (cloudAt > localAt) return cloud
    if (localAt > cloudAt) await pushCloud(localState)
    return null
  } catch { return null }
}
