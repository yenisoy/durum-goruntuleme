require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cors = require('cors');
const path = require('path');
const pool = require('./config/database');

const adminRoutes = require('./routes/adminRoutes');
const apiRoutes = require('./routes/apiRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Reverse proxy arkasında çalışırken doğru protokol/IP için
if (process.env.TRUST_PROXY) {
  const trust = process.env.TRUST_PROXY;
  app.set('trust proxy', isNaN(trust) ? trust : parseInt(trust));
}

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : '*',
  credentials: true,
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session — PostgreSQL store ile kalıcı
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'gizli-session-anahtari',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: IS_PROD,
    httpOnly: true,
    sameSite: IS_PROD ? 'lax' : false,
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

// Statik dosyalar
app.use('/static', express.static(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, '../public/admin')));

// Route'lar
app.use('/admin/api', adminRoutes);
app.use('/api', apiRoutes);

// Sağlık kontrolü
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ durum: 'ok', veritabani: 'bagli', zaman: new Date().toISOString() });
  } catch {
    res.status(503).json({ durum: 'hata', veritabani: 'baglanti_yok', zaman: new Date().toISOString() });
  }
});

// Admin SPA
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

// 404
app.use((req, res) => {
  res.status(404).json({ basarili: false, mesaj: 'Endpoint bulunamadı.' });
});

// Genel hata
app.use((err, req, res, next) => {
  console.error('Sunucu hatası:', err.message);
  res.status(500).json({ basarili: false, mesaj: err.message || 'Sunucu hatası.' });
});

async function baslat() {
  // Migration'ı otomatik çalıştır
  try {
    const { runMigration } = require('./config/migrate');
    await runMigration();
  } catch (err) {
    console.error('Migration başarısız, uygulama durduruluyor:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
    console.log(`Admin paneli: http://localhost:${PORT}/admin`);
    console.log(`Sağlık kontrolü: http://localhost:${PORT}/health`);
  });
}

baslat();

module.exports = app;
