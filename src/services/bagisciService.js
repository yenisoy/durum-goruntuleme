const pool = require('../config/database');
const { uniqueKodUret } = require('./uniqKodService');
const { normalizeTelefon } = require('./telefonService');

async function bulVeyaOlustur(client, adSoyad, telefonHam) {
  const { telefon, ulke_kodu_var_mi } = normalizeTelefon(telefonHam);

  // Telefon varsa önce ara
  if (telefon) {
    const mevcut = await client.query(
      'SELECT * FROM bagiscilar WHERE telefon = $1',
      [telefon]
    );
    if (mevcut.rowCount > 0) {
      // Bağışçı bulundu — adı veya ülke kodu değiştiyse güncelle
      const mevcutBagisci = mevcut.rows[0];
      const adDegisti = adSoyad && adSoyad !== mevcutBagisci.ad_soyad;
      const ulkeDegisti = ulke_kodu_var_mi !== mevcutBagisci.ulke_kodu_var_mi;

      if (adDegisti || ulkeDegisti) {
        const guncellenmis = await client.query(
          `UPDATE bagiscilar SET
            ad_soyad = COALESCE(NULLIF($1, ''), ad_soyad),
            ulke_kodu_var_mi = $2,
            updated_at = NOW()
           WHERE id = $3 RETURNING *`,
          [adSoyad, ulke_kodu_var_mi, mevcutBagisci.id]
        );
        return { bagisci: guncellenmis.rows[0], yeniOlusturuldu: false };
      }

      return { bagisci: mevcutBagisci, yeniOlusturuldu: false };
    }
  }

  // Yeni bağışçı oluştur
  const uniq_kod = await uniqueKodUret();
  const result = await client.query(
    `INSERT INTO bagiscilar (ad_soyad, telefon, ulke_kodu_var_mi, uniq_kod)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [adSoyad || 'Bilinmiyor', telefon, ulke_kodu_var_mi, uniq_kod]
  );

  return { bagisci: result.rows[0], yeniOlusturuldu: true };
}

async function uniqKodileBul(uniqKod) {
  const result = await pool.query(
    'SELECT * FROM bagiscilar WHERE uniq_kod = $1',
    [uniqKod.toUpperCase()]
  );
  return result.rows[0] || null;
}

module.exports = { bulVeyaOlustur, uniqKodileBul };
