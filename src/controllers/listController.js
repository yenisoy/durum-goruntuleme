const pool = require('../config/database');

async function bagiscilarListele(req, res) {
  const kullaniciId = req.session.kullaniciId;
  const sayfa = Math.max(1, parseInt(req.query.sayfa) || 1);
  const limit = Math.min(100000, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (sayfa - 1) * limit;
  const arama = req.query.arama ? `%${req.query.arama}%` : null;

  try {
    const params = [kullaniciId, limit, offset];
    let extraWhere = '';
    if (arama) { params.push(arama); extraWhere = `AND (b.ad_soyad ILIKE $4 OR b.telefon ILIKE $4 OR b.uniq_kod ILIKE $4)`; }

    const [satirlar, toplam] = await Promise.all([
      pool.query(
        `SELECT b.*, COUNT(bl.id)::int AS bagis_sayisi
         FROM bagiscilar b
         LEFT JOIN bagislar bl ON bl.bagisci_id = b.id
         WHERE b.kullanici_id = $1 ${extraWhere}
         GROUP BY b.id
         ORDER BY bagis_sayisi DESC, b.id ASC
         LIMIT $2 OFFSET $3`,
        params
      ),
      pool.query(
        `SELECT COUNT(*)::int FROM bagiscilar b WHERE kullanici_id = $1 ${arama ? 'AND (b.ad_soyad ILIKE $2 OR b.telefon ILIKE $2 OR b.uniq_kod ILIKE $2)' : ''}`,
        arama ? [kullaniciId, arama] : [kullaniciId]
      ),
    ]);

    res.json({ basarili: true, veri: satirlar.rows, toplam: toplam.rows[0].count, sayfa, limit });
  } catch (err) {
    console.error('Bağışçı listesi hatası:', err.message);
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function bagislarListele(req, res) {
  const kullaniciId = req.session.kullaniciId;
  const sayfa = Math.max(1, parseInt(req.query.sayfa) || 1);
  const limit = Math.min(100000, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (sayfa - 1) * limit;
  const arama = req.query.arama ? `%${req.query.arama}%` : null;
  const durum = req.query.durum || null;

  try {
    const kosullar = ['b.kullanici_id = $1'];
    const params = [kullaniciId];

    if (arama) {
      params.push(arama);
      kosullar.push(`(b.ad_soyad ILIKE $${params.length} OR b.cep_telefonu ILIKE $${params.length} OR b.excel_id ILIKE $${params.length})`);
    }
    if (durum) {
      params.push(durum);
      kosullar.push(`b.durum = $${params.length}`);
    }
    const whereClause = 'WHERE ' + kosullar.join(' AND ');

    const listParams = [...params, limit, offset];

    const [satirlar, toplam] = await Promise.all([
      pool.query(
        `SELECT b.*, bg.ad_soyad AS bagisci_adi, bg.uniq_kod, ref.ad_soyad AS referans_adi
         FROM bagislar b
         LEFT JOIN bagiscilar bg ON b.bagisci_id = bg.id
         LEFT JOIN bagiscilar ref ON b.referans_id = ref.id
         ${whereClause}
         ORDER BY b.created_at DESC
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
      ),
      pool.query(`SELECT COUNT(*)::int FROM bagislar b ${whereClause}`, params),
    ]);

    res.json({ basarili: true, veri: satirlar.rows, toplam: toplam.rows[0].count, sayfa, limit });
  } catch (err) {
    console.error('Bağış listesi hatası:', err.message);
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

module.exports = { bagiscilarListele, bagislarListele };
