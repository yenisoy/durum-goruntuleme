const axios = require('axios');
const pool = require('../config/database');

const MONO_KEYS = ['mono_slug', 'mono_api_token', 'mono_business_phone', 'mono_base_url'];
const MIN_ARALIK_MS = 500; // 60 sn / 120 mesaj = 500ms

async function configOku(kullaniciId) {
  const r = await pool.query(
    'SELECT mono_slug, mono_api_token, mono_business_phone, mono_base_url FROM kullanicilar WHERE id = $1',
    [kullaniciId]
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  return {
    slug: row.mono_slug || '',
    apiToken: row.mono_api_token || '',
    businessPhone: row.mono_business_phone || '',
    baseUrl: row.mono_base_url || 'https://app.monochat.ai',
  };
}

async function configKaydet(kullaniciId, { slug, apiToken, businessPhone, baseUrl }) {
  // Token boşsa mevcudu koru
  if (!apiToken) {
    const mevcut = await configOku(kullaniciId);
    apiToken = mevcut?.apiToken || '';
  }
  await pool.query(
    `UPDATE kullanicilar SET
       mono_slug = $1, mono_api_token = $2,
       mono_business_phone = $3, mono_base_url = $4,
       updated_at = NOW()
     WHERE id = $5`,
    [slug || '', apiToken || '', businessPhone || '', baseUrl || 'https://app.monochat.ai', kullaniciId]
  );
}

function telefonWhatsappFormat(ham, ulkeKoduVarMi) {
  if (!ulkeKoduVarMi) return null;
  if (!ham) return null;
  const tel = String(ham).replace(/\D/g, '');
  // Monochat ülke kodu DAHIL bekler: 905XXXXXXXXX
  if (tel.startsWith('90') && tel.length === 12) return tel;
  return null;
}

function placeholderDoldur(metin, bagisci) {
  if (!metin) return '';
  return String(metin)
    .replace(/\{BAGISCI_ADI_SOYADI\}/g, bagisci.ad_soyad || '')
    .replace(/\{UNIQ_KOD\}/g, bagisci.uniq_kod || '');
}

function hataDetayCikar(err) {
  if (!err) return 'Bilinmeyen hata';
  if (err.response && err.response.data) {
    const d = err.response.data;
    if (typeof d === 'object') {
      const parcalar = [];
      if (d.code) parcalar.push(`Kod: ${d.code}`);
      if (d.message) parcalar.push(d.message);
      if (d.error) parcalar.push(typeof d.error === 'string' ? d.error : JSON.stringify(d.error));
      if (parcalar.length) return parcalar.join(' — ');
      try { return JSON.stringify(d).slice(0, 250); } catch { return ''; }
    }
    return String(d).slice(0, 250);
  }
  return err.message || 'Hata detayı alınamadı';
}

/**
 * Monochat template SMS gönderir
 * @param {Object} config - { slug, apiToken, businessPhone, baseUrl }
 * @param {Object} payload - { templateName, languageCode, customerPhone, headerInput, bodyInputs }
 */
async function templateSend(config, { templateName, languageCode, customerPhone, headerComponent, bodyParams }) {
  if (!config.slug || !config.apiToken || !config.businessPhone) {
    throw new Error('Monochat yapılandırması eksik.');
  }

  const variables = [];
  if (headerComponent) variables.push(headerComponent);
  if (bodyParams && bodyParams.length > 0) {
    variables.push({ type: 'BODY', parameters: bodyParams });
  }

  const url = `${config.baseUrl.replace(/\/$/, '')}/api/${config.slug}/custom-functions/template-app/api/template/send.js`;

  const res = await axios.post(
    url,
    {
      phoneNumber: config.businessPhone,
      templateMessageName: templateName,
      languageCode: languageCode || 'tr',
      customerPhoneNumber: customerPhone,
      variables,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiToken}`,
      },
      timeout: 30000,
    }
  );

  return res.data;
}

module.exports = {
  configOku,
  configKaydet,
  templateSend,
  telefonWhatsappFormat,
  placeholderDoldur,
  hataDetayCikar,
  MIN_ARALIK_MS,
};
