const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── CONFIG ───────────────────────────────────────────────
const SERPAPI_KEY = process.env.SERPAPI_KEY || '03c94f5f1085187e9222bcb72e2a7dd2999460340ae87181388f4c0d4b69367d';
const PLACE_ID    = process.env.GOOGLE_PLACE_ID || 'ChIJcXMKdsG7yhQRZiqzqy9MJhQ';
// ──────────────────────────────────────────────────────────

// Cache (24 saat)
let cache = { puan: null, yorumSayisi: null, ts: 0 };
const CACHE_MS = 24 * 60 * 60 * 1000;

async function fetchGoogleRating() {
  const now = Date.now();
  if (cache.puan && (now - cache.ts) < CACHE_MS) return cache;

  try {
    // SerpAPI Google Maps place details
    const url = `https://serpapi.com/search.json?engine=google_maps&place_id=${PLACE_ID}&api_key=${SERPAPI_KEY}`;
    const res  = await fetch(url, { timeout: 15000 });
    const data = await res.json();

    console.log('SerpAPI yanıtı:', JSON.stringify(data).substring(0, 300));

    // SerpAPI yanıt yapısı: data.place_results veya data.local_results[0]
    const place = data.place_results
                || (data.local_results && data.local_results[0])
                || null;

    if (place && place.rating) {
      cache = {
        puan:        String(place.rating),
        yorumSayisi: place.reviews ? String(place.reviews) : null,
        ts:          now
      };
      console.log(`⭐ Rating güncellendi: ${cache.puan} (${cache.yorumSayisi || '?'} yorum)`);
    }
  } catch (err) {
    console.error('SerpAPI hatası:', err.message);
  }

  return cache;
}

// ─── MIDDLEWARE ───────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── STATIC FILES ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── PAGE ROUTES ──────────────────────────────────────────
const pages = ['rezervasyon', 'fiyatlar', 'portfolio', 'admin'];

pages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
  });
  app.get(`/${page}.html`, (req, res) => {
    res.redirect(`/${page}`);
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── API ROUTES ───────────────────────────────────────────

app.get('/api/google-rating', async (req, res) => {
  const data = await fetchGoogleRating();
  res.json({
    puan:        data.puan        || '4.9',
    yorumSayisi: data.yorumSayisi || null
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', cached: !!cache.puan, cachedPuan: cache.puan, ts: new Date().toISOString() });
});

// ─── 404 ──────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Server: http://localhost:${PORT}`);
  fetchGoogleRating();
});
