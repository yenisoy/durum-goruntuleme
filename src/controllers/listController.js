const pool = require('../config/database');

async function bagiscilarListele(req, res) {
  const sayfa = Math.max(1, parseInt(req.query.sayfa) || 1);
  const limit = Math.min(100000, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (sayfa - 1) * limit;
  const arama = req.query.arama ? `%${req.query.arama}%` : null;

  try {
    const listParams = arama ? [limit, offset, arama] : [limit, offset];
    const countParams = arama ? [arama] : [];
    const listWhere = arama
      ? 'WHERE b.ad_soyad ILIKE $3 OR b.telefon ILIKE $3 OR b.uniq_kod ILIKE $3'
      : '';
    const countWhere = arama
      ? 'WHERE b.ad_soyad ILIKE $1 OR b.telefon ILIKE $1 OR b.uniq_kod ILIKE $1'
      : '';

    const [satirlar, toplam] = await Promise.all([
      pool.query(
        `SELECT b.*, COUNT(bl.id) AS bagis_sayisi
         FROM bagiscilar b
         LEFT JOIN bagislar bl ON bl.bagisci_id = b.id
         ${listWhere}
         GROUP BY b.id
         ORDER BY bagis_sayisi DESC, b.id ASC
         LIMIT $1 OFFSET $2`,
        listParams
      ),
      pool.query(
        `SELECT COUNT(*) FROM bagiscilar b ${countWhere}`,
        countParams
      ),
    ]);

    res.json({
      basarili: true,
      veri: satirlar.rows,
      toplam: parseInt(toplam.rows[0].count),
      sayfa,
      limit,
    });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function bagislarListele(req, res) {
  const sayfa = Math.max(1, parseInt(req.query.sayfa) || 1);
  const limit = Math.min(100000, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (sayfa - 1) * limit;
  const arama = req.query.arama ? `%${req.query.arama}%` : null;
  const durum = req.query.durum || null;

  try {
    const kosullar = [];
    const params = [];

    if (arama) {
      params.push(arama);
      kosullar.push(`(b.ad_soyad ILIKE $${params.length} OR b.cep_telefonu ILIKE $${params.length} OR b.excel_id ILIKE $${params.length})`);
    }
    if (durum) {
      params.push(durum);
      kosullar.push(`b.durum = $${params.length}`);
    }

    const whereClause = kosullar.length ? 'WHERE ' + kosullar.join(' AND ') : '';

    const listParams = [...params, limit, offset];
    const countParams = [...params];

    const [satirlar, toplam] = await Promise.all([
      pool.query(
        `SELECT b.*,
           bg.ad_soyad AS bagisci_adi, bg.uniq_kod,
           ref.ad_soyad AS referans_adi
         FROM bagislar b
         LEFT JOIN bagiscilar bg ON b.bagisci_id = bg.id
         LEFT JOIN bagiscilar ref ON b.referans_id = ref.id
         ${whereClause}
         ORDER BY b.created_at DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
      ),
      pool.query(`SELECT COUNT(*) FROM bagislar b ${whereClause}`, countParams),
    ]);

    res.json({
      basarili: true,
      veri: satirlar.rows,
      toplam: parseInt(toplam.rows[0].count),
      sayfa,
      limit,
    });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

module.exports = { bagiscilarListele, bagislarListele };
