const pool = require('../config/database');

const SIRALAMA_KOLON_MAP = {
  id: 'b.id',
  ad_soyad: 'b.ad_soyad',
  telefon: 'b.telefon',
  uniq_kod: 'b.uniq_kod',
  crm_kod: 'b.crm_kod',
  bagis_sayisi: 'bagis_sayisi',
  sorgu_sayisi: 'b.sorgu_sayisi',
  wa_sayisi: 'wa_sayisi',
  created_at: 'b.created_at',
  updated_at: 'b.updated_at',
};

async function bagiscilarListele(req, res) {
  const kullaniciId = req.session.kullaniciId;
  const sayfa = Math.max(1, parseInt(req.query.sayfa) || 1);
  const limit = Math.min(100000, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (sayfa - 1) * limit;
  const arama = req.query.arama ? `%${req.query.arama}%` : null;
  const crmFiltre = req.query.crm_filtre;
  const siralamaKolon = SIRALAMA_KOLON_MAP[req.query.siralama] || null;
  const yon = req.query.yon === 'desc' ? 'DESC' : 'ASC';

  try {
    const kosullar = ['b.kullanici_id = $1'];
    const params = [kullaniciId];

    if (arama) {
      params.push(arama);
      kosullar.push(`(b.ad_soyad ILIKE $${params.length} OR b.telefon ILIKE $${params.length} OR b.uniq_kod ILIKE $${params.length} OR b.crm_kod ILIKE $${params.length})`);
    }
    if (crmFiltre === 'var') kosullar.push("b.crm_kod IS NOT NULL AND b.crm_kod != ''");
    else if (crmFiltre === 'yok') kosullar.push("(b.crm_kod IS NULL OR b.crm_kod = '')");

    // Tarih aralığı filtreleri (ISO format bekler)
    if (req.query.guncelleme_baslangic) {
      params.push(req.query.guncelleme_baslangic);
      kosullar.push(`b.updated_at >= $${params.length}`);
    }
    if (req.query.guncelleme_bitis) {
      params.push(req.query.guncelleme_bitis);
      kosullar.push(`b.updated_at <= $${params.length}`);
    }

    const where = 'WHERE ' + kosullar.join(' AND ');
    const listParams = [...params, limit, offset];

    const [satirlar, toplam] = await Promise.all([
      pool.query(
        `SELECT b.*,
           (SELECT COUNT(*)::int FROM bagislar
              WHERE (bagisci_id = b.id OR referans_id = b.id)
                AND kullanici_id = b.kullanici_id
           ) AS bagis_sayisi,
           (SELECT COUNT(*)::int FROM bagislar
              WHERE bagisci_id = b.id AND kullanici_id = b.kullanici_id
           ) AS bagisci_bagis_sayisi,
           (SELECT COUNT(*)::int FROM bagislar
              WHERE referans_id = b.id AND kullanici_id = b.kullanici_id
           ) AS referans_bagis_sayisi,
           (SELECT COUNT(*)::int FROM whatsapp_job_items wji
              JOIN whatsapp_jobs wj ON wj.id = wji.job_id
              WHERE wji.bagisci_id = b.id AND wji.durum = 'sent' AND wj.kullanici_id = b.kullanici_id
           ) AS wa_sayisi
         FROM bagiscilar b
         ${where}
         ORDER BY ${siralamaKolon ? `${siralamaKolon} ${yon} NULLS LAST, b.id ASC` : 'bagis_sayisi DESC, b.id ASC'}
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
      ),
      pool.query(`SELECT COUNT(*)::int FROM bagiscilar b ${where}`, params),
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
