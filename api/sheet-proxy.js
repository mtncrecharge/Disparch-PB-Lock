// /api/sheet-proxy.js
// Server-side proxy untuk fetch CSV dari Google Sheets (publish to web).
// Menghindari CORS dan ketergantungan ke proxy publik (allorigins/corsproxy/codetabs)
// yang sering down / rate-limited.
//
// Usage: /api/sheet-proxy?url=<encoded google sheets csv url>
//
// Cache: 60 detik di edge (CDN Vercel) — request berulang dalam 60s tidak
// akan hit Google Sheets lagi, jadi lebih cepat & mengurangi beban.

const ALLOWED_HOST = 'docs.google.com';

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    res.status(400).json({ error: 'Missing "url" query parameter' });
    return;
  }

  let target;
  try {
    target = new URL(url);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  // Whitelist: hanya izinkan fetch dari docs.google.com (published sheet CSV)
  if (target.hostname !== ALLOWED_HOST) {
    res.status(403).json({ error: 'Host not allowed' });
    return;
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SheetProxy/1.0)' },
      // 8s timeout
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Upstream HTTP ${upstream.status}` });
      return;
    }

    const text = await upstream.text();

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Cache di edge selama 60s, izinkan stale-while-revalidate 300s
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.status(200).send(text);
  } catch (err) {
    res.status(502).json({ error: 'Fetch failed: ' + (err && err.message) });
  }
}
