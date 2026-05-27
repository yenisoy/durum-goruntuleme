const pool = require('./database');

const migrationSQL = `
-- İlk kurulum: kullanicilar yoksa eski şemayı temizle
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kullanicilar') THEN
    DROP TABLE IF EXISTS bagislar CASCADE;
    DROP TABLE IF EXISTS bagiscilar CASCADE;
    DROP TABLE IF EXISTS ayarlar CASCADE;
    DROP TABLE IF EXISTS "session" CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS kullanicilar (
  id SERIAL PRIMARY KEY,
  kullanici_adi VARCHAR(50) UNIQUE NOT NULL,
  sifre_hash VARCHAR(255) NOT NULL,
  secret_key VARCHAR(64) UNIQUE NOT NULL,
  rol VARCHAR(20) DEFAULT 'user' CHECK (rol IN ('admin', 'user')),
  netgsm_username VARCHAR(50),
  netgsm_password VARCHAR(255),
  netgsm_appname VARCHAR(100),
  netgsm_msgheader VARCHAR(50),
  mono_slug VARCHAR(100),
  mono_api_token VARCHAR(500),
  mono_business_phone VARCHAR(20),
  mono_base_url VARCHAR(255) DEFAULT 'https://app.monochat.ai',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Mevcut kullanicilar tablosuna Monochat sütunlarını ekle (mevcut DB için)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kullanicilar' AND column_name = 'mono_slug') THEN
    ALTER TABLE kullanicilar ADD COLUMN mono_slug VARCHAR(100);
    ALTER TABLE kullanicilar ADD COLUMN mono_api_token VARCHAR(500);
    ALTER TABLE kullanicilar ADD COLUMN mono_business_phone VARCHAR(20);
    ALTER TABLE kullanicilar ADD COLUMN mono_base_url VARCHAR(255) DEFAULT 'https://app.monochat.ai';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bagiscilar (
  id SERIAL PRIMARY KEY,
  kullanici_id INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
  ad_soyad VARCHAR(255) NOT NULL,
  telefon VARCHAR(20),
  ulke_kodu_var_mi BOOLEAN DEFAULT false,
  uniq_kod CHAR(8) NOT NULL,
  crm_kod VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (kullanici_id, telefon),
  UNIQUE (kullanici_id, uniq_kod)
);

CREATE INDEX IF NOT EXISTS idx_bagiscilar_kullanici ON bagiscilar(kullanici_id);

-- Mevcut tablolara yeni kolonları ekle (ALTER)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bagiscilar' AND column_name = 'crm_kod') THEN
    ALTER TABLE bagiscilar ADD COLUMN crm_kod VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bagiscilar' AND column_name = 'ulke_kodu') THEN
    ALTER TABLE bagiscilar ADD COLUMN ulke_kodu VARCHAR(5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bagiscilar' AND column_name = 'sorgu_sayisi') THEN
    ALTER TABLE bagiscilar ADD COLUMN sorgu_sayisi INTEGER NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bagiscilar' AND column_name = 'son_sorgu_at') THEN
    ALTER TABLE bagiscilar ADD COLUMN son_sorgu_at TIMESTAMP;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_templates' AND column_name = 'kategori') THEN
    ALTER TABLE whatsapp_templates ADD COLUMN kategori VARCHAR(20) DEFAULT 'UTILITY';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_job_items' AND column_name = 'request_url') THEN
    ALTER TABLE whatsapp_job_items ADD COLUMN request_url TEXT;
    ALTER TABLE whatsapp_job_items ADD COLUMN request_payload JSONB;
    ALTER TABLE whatsapp_job_items ADD COLUMN response_status INTEGER;
    ALTER TABLE whatsapp_job_items ADD COLUMN response_data JSONB;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bagiscilar_crm_kod ON bagiscilar(crm_kod);
CREATE INDEX IF NOT EXISTS idx_bagiscilar_ulke_kodu ON bagiscilar(ulke_kodu);

CREATE TABLE IF NOT EXISTS bagislar (
  id SERIAL PRIMARY KEY,
  kullanici_id INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
  excel_id VARCHAR(100) NOT NULL,
  ad_soyad VARCHAR(255),
  cep_telefonu VARCHAR(20),
  cep_no_ulke_kodu_var_mi BOOLEAN DEFAULT false,
  kimin_adina VARCHAR(255),
  ikinci_ref VARCHAR(255),
  ikinci_ref_cep_no VARCHAR(20),
  durum VARCHAR(20) DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor', 'kesildi')),
  bagisci_id INTEGER REFERENCES bagiscilar(id) ON DELETE SET NULL,
  referans_id INTEGER REFERENCES bagiscilar(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (kullanici_id, excel_id)
);

CREATE INDEX IF NOT EXISTS idx_bagislar_kullanici ON bagislar(kullanici_id);
CREATE INDEX IF NOT EXISTS idx_bagislar_bagisci_id ON bagislar(bagisci_id);
CREATE INDEX IF NOT EXISTS idx_bagislar_referans_id ON bagislar(referans_id);

-- WhatsApp template tanımları
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id SERIAL PRIMARY KEY,
  kullanici_id INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
  ad VARCHAR(100) NOT NULL,
  dil_kodu VARCHAR(10) DEFAULT 'tr',
  components JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (kullanici_id, ad)
);

CREATE INDEX IF NOT EXISTS idx_wa_templates_kullanici ON whatsapp_templates(kullanici_id);

-- WhatsApp gönderim job'ları (background)
CREATE TABLE IF NOT EXISTS whatsapp_jobs (
  id SERIAL PRIMARY KEY,
  kullanici_id INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  template_ad VARCHAR(100),
  template_dil VARCHAR(10),
  template_snapshot JSONB,
  header_input TEXT,
  body_inputs JSONB DEFAULT '[]',
  aralik_ms INTEGER DEFAULT 600,
  durum VARCHAR(20) DEFAULT 'queued' CHECK (durum IN ('queued','running','paused','completed','cancelled','failed')),
  toplam INTEGER DEFAULT 0,
  islenmis INTEGER DEFAULT 0,
  basarili INTEGER DEFAULT 0,
  basarisiz INTEGER DEFAULT 0,
  atlanan INTEGER DEFAULT 0,
  hata_mesaji TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  bitis_zamani TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wa_jobs_kullanici ON whatsapp_jobs(kullanici_id);
CREATE INDEX IF NOT EXISTS idx_wa_jobs_durum ON whatsapp_jobs(durum);

-- Job içindeki tekil mesaj kayıtları
CREATE TABLE IF NOT EXISTS whatsapp_job_items (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES whatsapp_jobs(id) ON DELETE CASCADE,
  bagisci_id INTEGER REFERENCES bagiscilar(id) ON DELETE SET NULL,
  bagisci_ad VARCHAR(255),
  telefon VARCHAR(20),
  durum VARCHAR(20) DEFAULT 'pending' CHECK (durum IN ('pending','sent','failed','skipped')),
  sebep TEXT,
  sirano INTEGER NOT NULL,
  processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wa_items_job ON whatsapp_job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_wa_items_durum ON whatsapp_job_items(durum);
`;

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query(migrationSQL);

    const sayim = await client.query('SELECT COUNT(*)::int AS sayi FROM kullanicilar');
    if (sayim.rows[0].sayi === 0) {
      const adminUser = process.env.ADMIN_USERNAME || 'admin';
      const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
      const envSecret = process.env.SECRET_KEY;

      const bcrypt = require('bcryptjs');
      const sifreHash = await bcrypt.hash(adminPass, 10);
      const secretKey = envSecret && envSecret.length >= 16
        ? envSecret
        : require('crypto').randomBytes(24).toString('base64url');

      await client.query(
        `INSERT INTO kullanicilar (kullanici_adi, sifre_hash, secret_key, rol)
         VALUES ($1, $2, $3, 'admin')`,
        [adminUser, sifreHash, secretKey]
      );
      console.log(`İlk admin oluşturuldu: ${adminUser}`);
    }

    // Çalışmakta kalan job'ları "paused" yap (server restart sonrası)
    await client.query(
      "UPDATE whatsapp_jobs SET durum = 'paused', updated_at = NOW() WHERE durum = 'running'"
    );

    console.log('Migration başarıyla tamamlandı.');
  } catch (err) {
    console.error('Migration hatası:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { migrationSQL, runMigration };

if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
  runMigration().finally(() => pool.end());
}
