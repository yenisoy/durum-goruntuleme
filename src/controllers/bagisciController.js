const pool = require('../config/database');
const crmImport = require('../services/crmImportService');
const { normalizeTelefon } = require('../services/telefonService');

async function bagisciGuncelle(req, res) {
  const kullaniciId = req.session.kullaniciId;
  const id = parseInt(req.params.id);
  const { ad_soyad, telefon, crm_kod } = req.body;

  try {
    const mevcutRes = await pool.query(
      'SELECT * FROM bagiscilar WHERE kullanici_id = $1 AND id = $2',
      [kullaniciId, id]
    );
    if (mevcutRes.rowCount === 0) {
      return res.status(404).json({ basarili: false, mesaj: 'Bağışçı bulunamadı.' });
    }

    const set = [];
    const params = [];
    let idx = 1;

    if (ad_soyad !== undefined) {
      if (!ad_soyad || !String(ad_soyad).trim()) {
        return res.status(400).json({ basarili: false, mesaj: 'Adı Soyadı boş olamaz.' });
      }
      set.push(`ad_soyad = $${idx++}`);
      params.push(String(ad_soyad).trim());
    }

    if (telefon !== undefined) {
      const { telefon: norm, ulke_kodu_var_mi } = normalizeTelefon(telefon);
      if (telefon && !norm) {
        return res.status(400).json({ basarili: false, mesaj: 'Geçersiz telefon numarası.' });
      }
      // Aynı telefon başka birinde mi?
      if (norm) {
        const cak = await pool.query(
          'SELECT id FROM bagiscilar WHERE kullanici_id = $1 AND telefon = $2 AND id != $3',
          [kullaniciId, norm, id]
        );
        if (cak.rowCount > 0) {
          return res.status(400).json({ basarili: false, mesaj: 'Bu telefon başka bir bağışçıda kayıtlı.' });
        }
      }
      set.push(`telefon = $${idx++}`);
      params.push(norm);
      set.push(`ulke_kodu_var_mi = $${idx++}`);
      params.push(ulke_kodu_var_mi);
    }

    if (crm_kod !== undefined) {
      set.push(`crm_kod = $${idx++}`);
      params.push(crm_kod ? String(crm_kod).trim() : null);
    }

    if (set.length === 0) {
      return res.status(400).json({ basarili: false, mesaj: 'Güncellenecek alan yok.' });
    }

    set.push('updated_at = NOW()');
    params.push(kullaniciId, id);

    const r = await pool.query(
      `UPDATE bagiscilar SET ${set.join(', ')}
       WHERE kullanici_id = $${idx++} AND id = $${idx++}
       RETURNING *`,
      params
    );
    res.json({ basarili: true, bagisci: r.rows[0] });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function bagisciSil(req, res) {
  const kullaniciId = req.session.kullaniciId;
  const id = parseInt(req.params.id);

  try {
    const r = await pool.query(
      'DELETE FROM bagiscilar WHERE kullanici_id = $1 AND id = $2 RETURNING id',
      [kullaniciId, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ basarili: false, mesaj: 'Bağışçı bulunamadı.' });
    res.json({ basarili: true });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function crmImportYukle(req, res) {
  if (!req.file) return res.status(400).json({ basarili: false, mesaj: 'Excel dosyası yüklenmedi.' });
  try {
    const ozet = await crmImport.excelOkuVeIsle(req.file.buffer, req.session.kullaniciId);
    res.json({ basarili: true, ozet });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

module.exports = { bagisciGuncelle, bagisciSil, crmImportYukle };
