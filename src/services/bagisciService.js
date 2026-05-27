const pool = require('../config/database');
const { uniqueKodUret } = require('./uniqKodService');
const { normalizeTelefon } = require('./telefonService');

async function bulVeyaOlustur(client, kullaniciId, adSoyad, telefonHam) {
  const { telefon, ulke_kodu_var_mi, ulke_kodu } = normalizeTelefon(telefonHam);

  if (telefon) {
    const mevcut = await client.query(
      'SELECT * FROM bagiscilar WHERE kullanici_id = $1 AND telefon = $2',
      [kullaniciId, telefon]
    );
    if (mevcut.rowCount > 0) {
      const m = mevcut.rows[0];
      const adDegisti = adSoyad && adSoyad !== m.ad_soyad;
      const ulkeDegisti = ulke_kodu_var_mi !== m.ulke_kodu_var_mi || (ulke_kodu || null) !== (m.ulke_kodu || null);

      if (adDegisti || ulkeDegisti) {
        const g = await client.query(
          `UPDATE bagiscilar SET
            ad_soyad = COALESCE(NULLIF($1, ''), ad_soyad),
            ulke_kodu_var_mi = $2,
            ulke_kodu = $3,
            updated_at = NOW()
          WHERE id = $4 RETURNING *`,
          [adSoyad, ulke_kodu_var_mi, ulke_kodu, m.id]
        );
        return { bagisci: g.rows[0], yeniOlusturuldu: false };
      }
      return { bagisci: m, yeniOlusturuldu: false };
    }
  }

  const uniq_kod = await uniqueKodUret(client, kullaniciId);
  const r = await client.query(
    `INSERT INTO bagiscilar (kullanici_id, ad_soyad, telefon, ulke_kodu_var_mi, ulke_kodu, uniq_kod)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [kullaniciId, adSoyad || 'Bilinmiyor', telefon, ulke_kodu_var_mi, ulke_kodu, uniq_kod]
  );
  return { bagisci: r.rows[0], yeniOlusturuldu: true };
}

async function uniqKodileBul(kullaniciId, uniqKod) {
  const r = await pool.query(
    'SELECT * FROM bagiscilar WHERE kullanici_id = $1 AND uniq_kod = $2',
    [kullaniciId, String(uniqKod).toUpperCase()]
  );
  return r.rows[0] || null;
}

module.exports = { bulVeyaOlustur, uniqKodileBul };
