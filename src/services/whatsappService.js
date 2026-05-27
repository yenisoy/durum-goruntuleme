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

/**
 * Monochat'ten template listesini çeker
 */
async function templateleriCek(config) {
  if (!config.slug || !config.apiToken || !config.businessPhone) {
    throw new Error('Monochat yapılandırması eksik.');
  }
  const url = `${config.baseUrl.replace(/\/$/, '')}/api/${config.slug}/custom-functions/template-app/api/template/list.js`;
  const res = await axios.post(
    url,
    { phoneNumber: config.businessPhone },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiToken}`,
      },
      timeout: 30000,
    }
  );
  return res.data?.result?.templateMessages || [];
}

/**
 * Monochat template structure'ını bizim internal formatımıza çevirir
 */
function monochatComponentsToInternal(components) {
  if (!Array.isArray(components)) return [];
  return components.map(c => {
    if (c.type === 'HEADER') {
      return {
        type: 'HEADER',
        format: c.format || 'TEXT',
        text: c.text || '',
        variables: c.variables || [],
      };
    }
    if (c.type === 'BODY') {
      return {
        type: 'BODY',
        text: c.text || '',
        variables: c.variables || [],
      };
    }
    if (c.type === 'FOOTER') {
      return { type: 'FOOTER', text: c.text || '' };
    }
    if (c.type === 'BUTTONS' && Array.isArray(c.buttons)) {
      return {
        type: 'BUTTONS',
        buttons: c.buttons.map(b => ({
          type: b.type || 'URL',
          text: b.text || '',
          url_template: b.url || '',           // Monochat'teki tam URL (örn: "https://x.com/{{1}}")
          url_ornek: b.sampleText || '',       // Monochat'teki örnek URL
          has_variable: Array.isArray(b.variables) && b.variables.length > 0,
          variable_ornek: b.variables?.[0]?.exampleValue || '',
        })),
      };
    }
    return null;
  }).filter(Boolean);
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
  // buttonComponents zaten { type:'BUTTONS', buttons:[...] } yapısında geliyor
  if (Array.isArray(buttonComponents)) {
    for (const item of buttonComponents) variables.push(item);
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
    return {
      data: res.data,
      status: res.status,
      payload,
      url,
    };
  } catch (err) {
    // Hata durumunda payload ve URL'i de hataya iliştir
    err.gondrilenPayload = payload;
    err.gondrilenUrl = url;
    throw err;
  }
}

module.exports = {
  configOku,
  configKaydet,
  templateSend,
  templateleriCek,
  monochatComponentsToInternal,
  telefonWhatsappFormat,
  placeholderDoldur,
  hataDetayCikar,
  MIN_ARALIK_MS,
};
