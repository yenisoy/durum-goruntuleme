const pool = require('./database');

const migrationSQL = `
-- Multi-tenant yapıya geçiş: eski şema varsa (kullanicilar yoksa) temizle
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kullanicilar') THEN
    DROP TABLE IF EXISTS bagislar CASCADE;
    DROP TABLE IF EXISTS bagiscilar CASCADE;
    DROP TABLE IF EXISTS ayarlar CASCADE;
    DROP TABLE IF EXISTS "session" CASCADE;
  END IF;
END $$;

-- Kullanıcılar
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
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Bağışçılar (her bağışçı bir kullanıcıya ait)
CREATE TABLE IF NOT EXISTS bagiscilar (
  id SERIAL PRIMARY KEY,
  kullanici_id INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
  ad_soyad VARCHAR(255) NOT NULL,
  telefon VARCHAR(20),
  ulke_kodu_var_mi BOOLEAN DEFAULT false,
  uniq_kod CHAR(8) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (kullanici_id, telefon),
  UNIQUE (kullanici_id, uniq_kod)
);

CREATE INDEX IF NOT EXISTS idx_bagiscilar_kullanici ON bagiscilar(kullanici_id);

-- Bağışlar (her bağış bir kullanıcıya ait)
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
`;

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query(migrationSQL);

    // İlk admin'i oluştur (hiç kullanıcı yoksa)
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
