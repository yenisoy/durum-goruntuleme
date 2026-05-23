const pool = require('./database');

const migrationSQL = `
CREATE TABLE IF NOT EXISTS ayarlar (
  anahtar VARCHAR(100) PRIMARY KEY,
  deger TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bagiscilar (
  id SERIAL PRIMARY KEY,
  ad_soyad VARCHAR(255) NOT NULL,
  telefon VARCHAR(20),
  ulke_kodu_var_mi BOOLEAN DEFAULT false,
  uniq_kod CHAR(8) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bagiscilar_telefon
  ON bagiscilar (telefon)
  WHERE telefon IS NOT NULL AND telefon != '';

CREATE TABLE IF NOT EXISTS bagislar (
  id SERIAL PRIMARY KEY,
  excel_id VARCHAR(100) UNIQUE NOT NULL,
  ad_soyad VARCHAR(255),
  cep_telefonu VARCHAR(20),
  cep_no_ulke_kodu_var_mi BOOLEAN DEFAULT false,
  kimin_adina VARCHAR(255),
  ikinci_ref VARCHAR(255),
  ikinci_ref_cep_no VARCHAR(20),
  durum VARCHAR(20) DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor', 'kesildi')),
  bagisci_id INTEGER REFERENCES bagiscilar(id),
  referans_id INTEGER REFERENCES bagiscilar(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bagislar_bagisci_id ON bagislar(bagisci_id);
CREATE INDEX IF NOT EXISTS idx_bagislar_referans_id ON bagislar(referans_id);
`;

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query(migrationSQL);
    console.log('Migration başarıyla tamamlandı.');
  } catch (err) {
    console.error('Migration hatası:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { migrationSQL, runMigration };

// Doğrudan çalıştırılırsa migration yap ve çıkış yap
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
  runMigration().finally(() => pool.end());
}
