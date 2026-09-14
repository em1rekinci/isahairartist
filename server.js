const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── CONFIG ───────────────────────────────────────────────
const SERPAPI_KEY = process.env.SERPAPI_KEY || '03c94f5f1085187e9222bcb72e2a7dd2999460340ae87181388f4c0d4b69367d';
// İsme göre arama: place_id yönetimi gerektirmez, işletme adı Google'da net şekilde eşleşiyor
const GOOGLE_MAPS_QUERY = process.env.GOOGLE_MAPS_QUERY || 'Ön-As Coiffure Süleyman Demirel Merkez Şube Çukurova Adana';

// Telegram bildirim ayarları
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8898930852:AAEScxrohlmeXxsLxeLVJINA4Ff9gApjmsA';
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || '6973388736';
// ──────────────────────────────────────────────────────────

// Cache (24 saat)
let cache = { puan: null, yorumSayisi: null, ts: 0 };
const CACHE_MS = 24 * 60 * 60 * 1000;

async function fetchGoogleRating() {
  const now = Date.now();
  if (cache.puan && (now - cache.ts) < CACHE_MS) return cache;

  try {
    // SerpAPI Google Maps - işletme adına göre arama
    const url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(GOOGLE_MAPS_QUERY)}&api_key=${SERPAPI_KEY}`;
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

// Telegram'a bildirim gönder
async function telegramBildirGonder(metin) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('Telegram bildirim ayarları eksik, gönderilmedi.');
    return { ok: false, error: 'config-missing' };
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: metin,
        parse_mode: 'HTML'
      })
    });
    const data = await res.json();
    if (!data.ok) console.error('Telegram API hatası:', data);
    return data;
  } catch (err) {
    console.error('Telegram gönderim hatası:', err.message);
    return { ok: false, error: err.message };
  }
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

// Yeni rezervasyon bildirimi (rezervasyon.html tarafından çağrılır)
app.post('/api/notify-rezervasyon', async (req, res) => {
  try {
    const { ad, telefon, hizmet, tarih, saat, personel, not: notlar } = req.body || {};

    const tarihFmt = tarih
      ? new Date(tarih + 'T12:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
      : '—';

    const satirlar = [
      '🔔 <b>Yeni Rezervasyon Talebi</b>',
      '',
      `👤 <b>Ad Soyad:</b> ${ad || '—'}`,
      `📞 <b>Telefon:</b> ${telefon || '—'}`,
      `💈 <b>Personel:</b> ${personel || 'Fark etmez'}`,
      `✂️ <b>İşlem:</b> ${hizmet || '—'}`,
      `📅 <b>Tarih:</b> ${tarihFmt}`,
      `🕐 <b>Saat:</b> ${saat || '—'}`
    ];
    if (notlar) satirlar.push(`📝 <b>Not:</b> ${notlar}`);

    const sonuc = await telegramBildirGonder(satirlar.join('\n'));
    res.json({ ok: !!sonuc.ok });
  } catch (err) {
    console.error('Bildirim gönderme hatası:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
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
