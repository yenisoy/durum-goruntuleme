const pool = require('../config/database');
const { uniqKodileBul } = require('../services/bagisciService');

async function uniqKodSorgula(req, res) {
  const { uniq_kod } = req.body;

  if (!uniq_kod || String(uniq_kod).trim().length !== 8) {
    return res.status(400).json({ basarili: false, mesaj: 'Geçerli bir 8 karakterli kod giriniz.' });
  }

  try {
    const bagisci = await uniqKodileBul(String(uniq_kod).trim());

    if (!bagisci) {
      return res.status(404).json({ basarili: false, mesaj: 'Bu koda ait kayıt bulunamadı.' });
    }

    const bagislarSonuc = await pool.query(
      `SELECT
        b.id,
        b.excel_id,
        b.ad_soyad,
        b.kimin_adina,
        b.ikinci_ref AS referans,
        b.durum,
        b.bagisci_id,
        b.referans_id,
        b.created_at,
        b.updated_at
       FROM bagislar b
       WHERE b.bagisci_id = $1
       ORDER BY b.created_at ASC`,
      [bagisci.id]
    );

    return res.json({
      basarili: true,
      bagisci: {
        ad_soyad: bagisci.ad_soyad,
        uniq_kod: bagisci.uniq_kod,
        telefon: bagisci.telefon,
        ulke_kodu_var_mi: bagisci.ulke_kodu_var_mi,
      },
      bagislar: bagislarSonuc.rows,
      toplam: bagislarSonuc.rowCount,
    });
  } catch (err) {
    console.error('Sorgu hatası:', err.message);
    return res.status(500).json({ basarili: false, mesaj: 'Sorgu sırasında hata oluştu.' });
  }
}

module.exports = { uniqKodSorgula };
