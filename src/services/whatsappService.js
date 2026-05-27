const axios = require('axios');
const pool = require('../config/database');
const { WHATSAPP_KNOWN_CC } = require('./telefonService');

const MIN_ARALIK_MS = 500;

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

/**
 * @param {string} ham - ham telefon
 * @param {string|null} ulkeKodu - tespit edilen ülke kodu
 * @param {boolean} ulkeKoduVarMi - eski bayrak
 * @param {boolean} digerleriIzinli - bilinmeyen CC'ye gönderim izni
 * @returns {{tel: string|null, sebep: string|null, bilinen: boolean}}
 */
function telefonWhatsappFormat(ham, ulkeKodu, ulkeKoduVarMi, digerleriIzinli = false) {
  if (!ham) return { tel: null, sebep: 'Telefon yok', bilinen: false };

  const tel = String(ham).replace(/\D/g, '');
  if (tel.length < 10 || tel.length > 15) {
    return { tel: null, sebep: 'Telefon uzunluğu uygun değil', bilinen: false };
  }

  // Ülke kodu hiç yoksa gönderim mümkün değil
  if (!ulkeKodu && !ulkeKoduVarMi) {
    return { tel: null, sebep: 'Ülke kodu yok — gönderim için telefon ülke kodlu olmalı', bilinen: false };
  }

  const bilinen = ulkeKodu && WHATSAPP_KNOWN_CC.includes(String(ulkeKodu));
  if (!bilinen && !digerleriIzinli) {
    return {
      tel: null,
      sebep: `Ülke kodu (${ulkeKodu || '?'}) izinli listede değil — "Diğer ülkelere gönder" seçeneğini açın`,
      bilinen: false,
    };
  }

  return { tel, sebep: null, bilinen };
}

function placeholderDoldur(metin, bagisci) {
  if (metin === null || metin === undefined) return '';
  return String(metin)
    .replace(/\{BAGISCI_ADI_SOYADI\}/g, bagisci.ad_soyad || '')
    .replace(/\{UNIQ_KOD\}/g, bagisci.uniq_kod || '')
    .replace(/\{CRM_KOD\}/g, bagisci.crm_kod || '');
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

async function templateSend(config, { templateName, languageCode, customerPhone, headerComponent, bodyParams, buttonComponents }) {
  if (!config.slug || !config.apiToken || !config.businessPhone) {
    throw new Error('Monochat yapılandırması eksik.');
  }

  const variables = [];
  if (headerComponent) variables.push(headerComponent);
  if (bodyParams && bodyParams.length > 0) {
    variables.push({ type: 'BODY', parameters: bodyParams });
  }
  if (Array.isArray(buttonComponents)) {
    for (const btn of buttonComponents) variables.push(btn);
  }

  const url = `${config.baseUrl.replace(/\/$/, '')}/api/${config.slug}/custom-functions/template-app/api/template/send.js`;

  const payload = {
    phoneNumber: config.businessPhone,
    templateMessageName: templateName,
    languageCode: languageCode || 'tr',
    customerPhoneNumber: customerPhone,
    variables,
  };

  try {
    const res = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiToken}`,
      },
      timeout: 30000,
    });
    return res.data;
  } catch (err) {
    // Hata mesajına gönderdiğimiz payload'ı da ekle (debug için)
    if (err.response) {
      err.gondrilenPayload = payload;
    }
    throw err;
  }
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
