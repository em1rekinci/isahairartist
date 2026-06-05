const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── CONFIG ───────────────────────────────────────────────
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || '1577e89d7df1e17c8f6236a42460d9fd';
const PLACE_ID        = process.env.GOOGLE_PLACE_ID || 'ChIJcXMKdsG7yhQRZiqzqy9MJhQ';
// ──────────────────────────────────────────────────────────

// Cache (24 saat)
let cache = { puan: null, yorumSayisi: null, ts: 0 };
const CACHE_MS = 24 * 60 * 60 * 1000;

async function fetchGoogleRating() {
  const now = Date.now();
  if (cache.puan && (now - cache.ts) < CACHE_MS) return cache;

  try {
    // ScraperAPI Google Maps scrape — structured data döndürür
    const targetUrl = `https://www.google.com/maps/place/?q=place_id:${PLACE_ID}&hl=tr`;
    const url = `http://api.scraperapi.com/?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(targetUrl)}&render=true`;

    const res  = await fetch(url, { timeout: 20000 });
    const html = await res.text();

    // Google Maps HTML'den rating parse
    // Örnek: 4,9 yıldız / 4.9 stars
    let puan = null;
    let yorumSayisi = null;

    // Yöntem 1: JSON-LD veya meta
    const jsonMatch = html.match(/"aggregateRating"[^}]*"ratingValue"\s*:\s*"?([\d,\.]+)"?/);
    if (jsonMatch) puan = jsonMatch[1].replace(',', '.');

    // Yöntem 2: aria-label içinde
    if (!puan) {
      const ariaMatch = html.match(/aria-label="([\d,\.]+)\s*yıldız/i);
      if (ariaMatch) puan = ariaMatch[1].replace(',', '.');
    }

    // Yöntem 3: genel pattern
    if (!puan) {
      const m = html.match(/>([\d],[0-9])</) || html.match(/>([\d]\.[0-9])</);
      if (m) puan = m[1].replace(',', '.');
    }

    // Yorum sayısı
    const yorumMatch = html.match(/([\d\.]+)\s*(?:yorum|değerlendirme|review)/i);
    if (yorumMatch) yorumSayisi = yorumMatch[1].replace('.', '');

    if (puan) {
      cache = { puan, yorumSayisi, ts: now };
      console.log(`⭐ Rating güncellendi: ${puan} (${yorumSayisi || '?'} yorum)`);
    }
  } catch (err) {
    console.error('Rating fetch hatası:', err.message);
  }

  return cache;
}

// ─── API ──────────────────────────────────────────────────

app.get('/api/google-rating', async (req, res) => {
  const data = await fetchGoogleRating();
  // Hata olursa veya cache boşsa fallback 4.9
  res.json({
    puan:        data.puan        || '4.9',
    yorumSayisi: data.yorumSayisi || null
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', cached: !!cache.puan, ts: new Date().toISOString() });
});

// ─── STATIC ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  const file = req.path.replace(/^\//, '') || 'index.html';
  const safePath = path.join(__dirname, 'public', file);
  res.sendFile(safePath, err => {
    if (err) res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
});

// ─── START ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Server: http://localhost:${PORT}`);
  fetchGoogleRating();
});
