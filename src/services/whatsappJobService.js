const pool = require('../config/database');
const wa = require('./whatsappService');
const wat = require('./whatsappTemplateService');

const MIN_ARALIK_MS = 500; // dakikada en fazla 120 mesaj
const aktifJoblar = new Map(); // kullaniciId -> { jobId, stopFlag }

async function aktifJobBul(kullaniciId) {
  const r = await pool.query(
    "SELECT * FROM whatsapp_jobs WHERE kullanici_id = $1 AND durum IN ('queued','running','paused') ORDER BY id DESC LIMIT 1",
    [kullaniciId]
  );
  return r.rows[0] || null;
}

async function jobBul(kullaniciId, jobId) {
  const r = await pool.query(
    'SELECT * FROM whatsapp_jobs WHERE kullanici_id = $1 AND id = $2',
    [kullaniciId, jobId]
  );
  return r.rows[0] || null;
}

async function jobOlustur(kullaniciId, payload) {
  const { template_id, header_input, body_inputs, button_inputs, bagisci_ids, aralik_ms, diger_ulkeler } = payload;
  if (!template_id) throw new Error('Template seçimi zorunlu.');
  if (!Array.isArray(bagisci_ids) || bagisci_ids.length === 0) throw new Error('En az bir bağışçı seçin.');

  const aktif = await aktifJobBul(kullaniciId);
  if (aktif) throw new Error(`Halen aktif bir gönderim var (#${aktif.id}). Bitirmeden yeni başlatamazsınız.`);

  const template = await wat.bul(kullaniciId, template_id);
  if (!template) throw new Error('Template bulunamadı.');

  const aralik = Math.max(MIN_ARALIK_MS, Math.min(60000, parseInt(aralik_ms) || 600));
  // body_inputs içine button_inputs ve diger_ulkeler de ekle (jsonb)
  const bodyInputsFull = {
    body: body_inputs || [],
    buttons: button_inputs || [],
    diger_ulkeler: !!diger_ulkeler,
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const jobRes = await client.query(
      `INSERT INTO whatsapp_jobs
        (kullanici_id, template_id, template_ad, template_dil, template_snapshot,
         header_input, body_inputs, aralik_ms, durum, toplam)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'queued',$9)
       RETURNING *`,
      [
        kullaniciId, template.id, template.ad, template.dil_kodu,
        JSON.stringify(template.components),
        header_input || null,
        JSON.stringify(bodyInputsFull),
        aralik,
        bagisci_ids.length,
      ]
    );
    const job = jobRes.rows[0];

    // Job item'ları DB'ye yaz — bağışçıları sırasıyla
    const bagiscilar = await client.query(
      `SELECT id, ad_soyad, telefon, ulke_kodu_var_mi, uniq_kod FROM bagiscilar
       WHERE kullanici_id = $1 AND id = ANY($2)
       ORDER BY array_position($2::int[], id)`,
      [kullaniciId, bagisci_ids]
    );

    for (let i = 0; i < bagiscilar.rows.length; i++) {
      const b = bagiscilar.rows[i];
      await client.query(
        `INSERT INTO whatsapp_job_items (job_id, bagisci_id, bagisci_ad, telefon, sirano)
         VALUES ($1, $2, $3, $4, $5)`,
        [job.id, b.id, b.ad_soyad, b.telefon, i + 1]
      );
    }

    await client.query('COMMIT');
    return job;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function jobBaslat(kullaniciId, jobId) {
  const job = await jobBul(kullaniciId, jobId);
  if (!job) throw new Error('Job bulunamadı.');
  if (['completed', 'cancelled'].includes(job.durum)) {
    throw new Error('Bu job zaten sonlanmış.');
  }

  // Aktif job kontrol — başkasınınkisi varsa hayır
  if (aktifJoblar.has(kullaniciId) && aktifJoblar.get(kullaniciId).jobId !== jobId) {
    throw new Error('Başka bir job zaten çalışıyor.');
  }

  await pool.query("UPDATE whatsapp_jobs SET durum = 'running', updated_at = NOW() WHERE id = $1", [jobId]);

  // Processor'ı arka planda başlat (await yok!)
  jobIsle(kullaniciId, jobId).catch(err => {
    console.error(`Job #${jobId} hatası:`, err.message);
    pool.query(
      "UPDATE whatsapp_jobs SET durum = 'failed', hata_mesaji = $1, updated_at = NOW(), bitis_zamani = NOW() WHERE id = $2",
      [err.message, jobId]
    ).catch(() => {});
  });

  return jobBul(kullaniciId, jobId);
}

async function jobDurdur(kullaniciId, jobId) {
  const job = await jobBul(kullaniciId, jobId);
  if (!job) throw new Error('Job bulunamadı.');
  if (job.durum !== 'running') throw new Error('Sadece çalışan job duraklatılabilir.');

  await pool.query("UPDATE whatsapp_jobs SET durum = 'paused', updated_at = NOW() WHERE id = $1", [jobId]);
  if (aktifJoblar.has(kullaniciId)) aktifJoblar.get(kullaniciId).stopFlag = true;
  return jobBul(kullaniciId, jobId);
}

async function jobIptal(kullaniciId, jobId) {
  const job = await jobBul(kullaniciId, jobId);
  if (!job) throw new Error('Job bulunamadı.');
  if (['completed', 'cancelled'].includes(job.durum)) return job;

  await pool.query(
    "UPDATE whatsapp_jobs SET durum = 'cancelled', updated_at = NOW(), bitis_zamani = NOW() WHERE id = $1",
    [jobId]
  );
  if (aktifJoblar.has(kullaniciId)) aktifJoblar.get(kullaniciId).stopFlag = true;
  return jobBul(kullaniciId, jobId);
}

async function jobIsle(kullaniciId, jobId) {
  const stopRef = { stopFlag: false, jobId };
  aktifJoblar.set(kullaniciId, stopRef);

  try {
    const config = await wa.configOku(kullaniciId);
    if (!config || !config.slug || !config.apiToken || !config.businessPhone) {
      throw new Error('Monochat yapılandırması eksik.');
    }

    while (!stopRef.stopFlag) {
      const job = await jobBul(kullaniciId, jobId);
      if (!job) break;
      if (job.durum !== 'running') break;

      // Sıradaki pending item'ı al
      const itemRes = await pool.query(
        `SELECT i.*, b.uniq_kod, b.ulke_kodu_var_mi, b.ulke_kodu, b.crm_kod
         FROM whatsapp_job_items i
         LEFT JOIN bagiscilar b ON b.id = i.bagisci_id
         WHERE i.job_id = $1 AND i.durum = 'pending'
         ORDER BY i.sirano ASC LIMIT 1`,
        [jobId]
      );

      if (itemRes.rowCount === 0) {
        // Tüm item'lar işlendi
        await pool.query(
          "UPDATE whatsapp_jobs SET durum = 'completed', updated_at = NOW(), bitis_zamani = NOW() WHERE id = $1",
          [jobId]
        );
        break;
      }

      const item = itemRes.rows[0];
      const bagisciData = {
        ad_soyad: item.bagisci_ad,
        uniq_kod: item.uniq_kod,
        crm_kod: item.crm_kod,
      };

      // body_inputs artık { body, buttons, diger_ulkeler } objesi
      const rawBody = job.body_inputs || {};
      const bodyInputs = Array.isArray(rawBody) ? rawBody : (rawBody.body || []);
      const buttonInputs = Array.isArray(rawBody) ? [] : (rawBody.buttons || []);
      const digerUlkeler = !Array.isArray(rawBody) && !!rawBody.diger_ulkeler;

      // Telefon kontrolü (çoklu ülke kodu destekli)
      const tfor = wa.telefonWhatsappFormat(item.telefon, item.ulke_kodu, item.ulke_kodu_var_mi, digerUlkeler);
      const customerPhone = tfor.tel;

      if (!customerPhone) {
        await pool.query(
          `UPDATE whatsapp_job_items SET durum = 'skipped', sebep = $1, processed_at = NOW() WHERE id = $2`,
          [tfor.sebep || 'Telefon uygun değil', item.id]
        );
        await pool.query(
          "UPDATE whatsapp_jobs SET islenmis = islenmis + 1, atlanan = atlanan + 1, updated_at = NOW() WHERE id = $1",
          [jobId]
        );
        continue;
      }

      const headerInput = job.header_input;
      const templateSnapshot = job.template_snapshot || [];

      const headerVarMi = Array.isArray(templateSnapshot) && templateSnapshot.some(c => c.type === 'HEADER');
      let headerComponent = null;
      if (headerVarMi && headerInput) {
        const headerComp = templateSnapshot.find(c => c.type === 'HEADER');
        const format = (headerComp.format || 'TEXT').toUpperCase();
        const value = wa.placeholderDoldur(headerInput, bagisciData);
        headerComponent = { type: 'HEADER', parameters: [value] };
      }

      const bodyParams = (bodyInputs || []).map(b => wa.placeholderDoldur(b, bagisciData));

      // BUTTONS: Monochat nested yapısı bekliyor — template ile aynı: { type: 'BUTTONS', buttons: [{ parameters: [...] }] }
      // Her buton kendi parametrelerini içerir, butonun variable'ı yoksa parameters boş
      let buttonComponents = null;
      if (Array.isArray(templateSnapshot)) {
        const btnComp = templateSnapshot.find(c => c.type === 'BUTTONS');
        if (btnComp && Array.isArray(btnComp.buttons) && btnComp.buttons.some(b => b.has_variable)) {
          const buttonsPayload = btnComp.buttons.map((btn, idx) => {
            if (btn.has_variable && buttonInputs[idx] !== undefined && buttonInputs[idx] !== null) {
              const val = wa.placeholderDoldur(buttonInputs[idx], bagisciData);
              return { parameters: [String(val)] };
            }
            return { parameters: [] };
          });
          buttonComponents = [{ type: 'BUTTONS', buttons: buttonsPayload }];
        }
      }

      try {
        const sonuc = await wa.templateSend(config, {
          templateName: job.template_ad,
          languageCode: job.template_dil || 'tr',
          customerPhone,
          headerComponent,
          bodyParams,
          buttonComponents,
        });

        await pool.query(
          `UPDATE whatsapp_job_items SET
             durum = 'sent', processed_at = NOW(),
             request_url = $1, request_payload = $2,
             response_status = $3, response_data = $4
           WHERE id = $5`,
          [sonuc.url, sonuc.payload, sonuc.status, sonuc.data, item.id]
        );
        await pool.query(
          "UPDATE whatsapp_jobs SET islenmis = islenmis + 1, basarili = basarili + 1, updated_at = NOW() WHERE id = $1",
          [jobId]
        );
      } catch (err) {
        const sebep = wa.hataDetayCikar(err);
        const responseData = err.response?.data
          ? (typeof err.response.data === 'object' ? err.response.data : { raw: String(err.response.data) })
          : { error: err.message || 'Bilinmeyen hata' };
        await pool.query(
          `UPDATE whatsapp_job_items SET
             durum = 'failed', sebep = $1, processed_at = NOW(),
             request_url = $2, request_payload = $3,
             response_status = $4, response_data = $5
           WHERE id = $6`,
          [
            sebep,
            err.gondrilenUrl || null,
            err.gondrilenPayload || null,
            err.response?.status || null,
            responseData,
            item.id,
          ]
        );
        await pool.query(
          "UPDATE whatsapp_jobs SET islenmis = islenmis + 1, basarisiz = basarisiz + 1, updated_at = NOW() WHERE id = $1",
          [jobId]
        );
      }

      // Aralık bekleme — stopFlag'i periyodik kontrol et
      const aralik = job.aralik_ms || MIN_ARALIK_MS;
      const adim = 200;
      let bekledi = 0;
      while (bekledi < aralik && !stopRef.stopFlag) {
        await new Promise(r => setTimeout(r, Math.min(adim, aralik - bekledi)));
        bekledi += adim;
      }
    }
  } finally {
    aktifJoblar.delete(kullaniciId);
  }
}

async function jobItemList(kullaniciId, jobId, { limit = 100, offset = 0, durum = null } = {}) {
  const job = await jobBul(kullaniciId, jobId);
  if (!job) throw new Error('Job bulunamadı.');

  const params = [jobId];
  let whereDurum = '';
  if (durum) { params.push(durum); whereDurum = `AND durum = $${params.length}`; }
  params.push(limit, offset);

  const r = await pool.query(
    `SELECT * FROM whatsapp_job_items
     WHERE job_id = $1 ${whereDurum}
     ORDER BY sirano ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return r.rows;
}

async function jobList(kullaniciId, limit = 20) {
  const r = await pool.query(
    'SELECT * FROM whatsapp_jobs WHERE kullanici_id = $1 ORDER BY id DESC LIMIT $2',
    [kullaniciId, limit]
  );
  return r.rows;
}

// Sunucu açıldığında paused durumdaki job'ları otomatik devam ettirmez
// Kullanıcı manuel başlatır
async function aktifJoblariYeniden() {
  // Bu fonksiyon istenirse paused job'ları auto-resume için kullanılabilir
  // Şimdilik sadece running → paused yapılıyor migrate.js'de
}

module.exports = {
  jobOlustur, jobBaslat, jobDurdur, jobIptal, jobBul, jobList,
  aktifJobBul, jobItemList, aktifJoblariYeniden,
  MIN_ARALIK_MS,
};
