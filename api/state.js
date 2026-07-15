// Cloud store: single JSON document in Vercel Blob.
// Writes use random-suffixed pathnames (immutable URLs, no CDN staleness); GET picks the newest.
import { put, list, del } from '@vercel/blob'

export default async function handler(req, res) {
  const key = req.headers['x-sync-key']
  if (!process.env.SYNC_KEY || key !== process.env.SYNC_KEY) {
    return res.status(401).json({ error: 'invalid sync key' })
  }

  if (req.method === 'GET') {
    const { blobs } = await list({ prefix: 'bch/state-' })
    if (!blobs.length) return res.status(404).json({ error: 'no cloud data yet' })
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    const r = await fetch(blobs[0].url)
    const json = await r.json()
    res.setHeader('cache-control', 'no-store')
    return res.status(200).json(json)
  }

  if (req.method === 'PUT') {
    const body = req.body
    if (!body || !Array.isArray(body.brands)) return res.status(400).json({ error: 'invalid state' })
    const blob = await put('bch/state-' + Date.now() + '.json', JSON.stringify(body), {
      access: 'public',
      contentType: 'application/json',
    })
    // prune older snapshots, keep the 5 most recent as backups
    const { blobs } = await list({ prefix: 'bch/state-' })
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    const stale = blobs.slice(5).map((b) => b.url)
    if (stale.length) await del(stale)
    return res.status(200).json({ ok: true, savedAt: body.savedAt, url: blob.pathname })
  }

  res.setHeader('allow', 'GET, PUT')
  return res.status(405).json({ error: 'method not allowed' })
}
