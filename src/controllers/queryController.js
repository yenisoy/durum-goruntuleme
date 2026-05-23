const pool = require('../config/database');
const k = require('../services/kullaniciService');

async function uniqKodSorgula(req, res) {
  const { uniq_kod } = req.body;
  const secretKey = req.headers['x-secret-key'] || req.body?.secret_key || req.query.secret_key;

  if (!secretKey) {
    return res.status(401).json({ basarili: false, mesaj: 'Secret key gerekli.' });
  }

  if (!uniq_kod || String(uniq_kod).trim().length !== 8) {
    return res.status(400).json({ basarili: false, mesaj: 'Geçerli bir 8 karakterli kod giriniz.' });
  }

  try {
    // Secret key ile kullanıcıyı bul
    const kullanici = await k.bulBySecretKey(secretKey);
    if (!kullanici) {
      return res.status(401).json({ basarili: false, mesaj: 'Geçersiz secret key.' });
    }

    // Bağışçıyı kullanıcı bazında ara
    const bagisciRes = await pool.query(
      'SELECT * FROM bagiscilar WHERE kullanici_id = $1 AND uniq_kod = $2',
      [kullanici.id, String(uniq_kod).trim().toUpperCase()]
    );

    if (bagisciRes.rowCount === 0) {
      return res.status(404).json({ basarili: false, mesaj: 'Bu koda ait kayıt bulunamadı.' });
    }
    const bagisci = bagisciRes.rows[0];

    const bagislarRes = await pool.query(
      `SELECT id, excel_id, ad_soyad, kimin_adina, ikinci_ref AS referans,
              durum, bagisci_id, referans_id, created_at, updated_at
       FROM bagislar
       WHERE kullanici_id = $1 AND bagisci_id = $2
       ORDER BY created_at ASC`,
      [kullanici.id, bagisci.id]
    );

    return res.json({
      basarili: true,
      bagisci: {
        ad_soyad: bagisci.ad_soyad,
        uniq_kod: bagisci.uniq_kod,
        telefon: bagisci.telefon,
        ulke_kodu_var_mi: bagisci.ulke_kodu_var_mi,
      },
      bagislar: bagislarRes.rows,
      toplam: bagislarRes.rowCount,
    });
  } catch (err) {
    console.error('Sorgu hatası:', err.message);
    res.status(500).json({ basarili: false, mesaj: 'Sorgu sırasında hata oluştu.' });
  }
}

module.exports = { uniqKodSorgula };
