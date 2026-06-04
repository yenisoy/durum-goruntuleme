const axios = require('axios');

const NETGSM_REST_URL = 'https://api.netgsm.com.tr/sms/rest/v2/send';

// Resmi NetGSM dönüş kodları → açıklama
const KOD_ACIKLAMA = {
  '00': 'Başarılı — mesaj gönderildi',
  '20': 'Mesaj metni hatalı veya karakter sınırı aşıldı',
  '30': 'Geçersiz kullanıcı/şifre, API erişim izni yok veya IP kısıtlaması (sunucu IP\'sini panelden whitelist\'e ekleyin)',
  '40': 'Gönderici başlığı (msgheader) sistemde onaylı değil',
  '50': 'İYS kontrollü hesap — alıcı izinli listede değil',
  '51': 'İYS marka bilgisi eksik (ticari mesajda partnercode gerekli)',
  '70': 'Hatalı veya eksik parametre',
  '80': 'Gönderim sınırı aşıldı',
  '85': 'Mükerrer gönderim sınırı aşıldı',
  config: 'NetGSM yapılandırması eksik (usercode/password/msgheader)',
  no_recipient: 'Geçerli alıcı bulunamadı',
  exception: 'HTTP veya bağlantı hatası',
};

function normalizeNumber(number) {
  if (!number) return '';
  let n = String(number).trim().replace(/\s+/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  if (n.startsWith('00')) n = n.slice(2);
  return n.replace(/\D/g, '');
}

/**
 * NetGSM REST v2 SMS gönder. Asla throw etmez, hep result objesi döner.
 * @param {Object} config - { usercode, password, header, iysfilter?, partnercode?, encoding? }
 * @param {string|string[]} recipients - 90... formatında numara veya numaralar
 * @param {string} message
 * @param {Object} options - config alanlarını override eder
 * @returns {Promise<{success: boolean, code: string, jobid: any, description: string, request: object, response: object}>}
 */
async function sms_gonder(config, recipients, message, options = {}) {
  const usercode = options.usercode || config.usercode;
  const password = options.password || config.password;
  const header   = options.header   || config.header;

  if (!usercode || !password || !header) {
    return {
      success: false,
      code: 'config',
      jobid: null,
      description: KOD_ACIKLAMA.config,
      request: null,
      response: null,
    };
  }

  const list = Array.isArray(recipients) ? recipients : [recipients];
  const numbers = list.map(normalizeNumber).filter(Boolean);

  if (!numbers.length) {
    return {
      success: false,
      code: 'no_recipient',
      jobid: null,
      description: KOD_ACIKLAMA.no_recipient,
      request: null,
      response: null,
    };
  }

  const payload = {
    msgheader: header,
    encoding: options.encoding || config.encoding || 'TR',
    messages: numbers.map(no => ({ msg: message, no })),
  };

  const iysfilter = options.iysfilter ?? config.iysfilter;
  if (iysfilter !== undefined && iysfilter !== null && iysfilter !== '') {
    payload.iysfilter = String(iysfilter);
  }

  const partnercode = options.partnercode ?? config.partnercode;
  if (partnercode) payload.partnercode = String(partnercode);

  // Request snapshot — password'ü göster ama maske
  const requestSnapshot = {
    url: NETGSM_REST_URL,
    method: 'POST',
    auth: { username: usercode, password: '••••••••' },
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  };

  try {
    const r = await axios.post(NETGSM_REST_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      auth: { username: usercode, password },
      timeout: 30000,
    });

    const code = String(r.data?.code ?? '');
    const description = r.data?.description || KOD_ACIKLAMA[code] || '';
    return {
      success: code === '00',
      code,
      jobid: r.data?.jobid ?? null,
      description,
      request: requestSnapshot,
      response: { status: r.status, data: r.data },
    };
  } catch (err) {
    const code = String(err.response?.data?.code ?? 'exception');
    const description =
      err.response?.data?.description ||
      KOD_ACIKLAMA[code] ||
      err.message ||
      'Bilinmeyen hata';
    return {
      success: false,
      code,
      jobid: null,
      description,
      request: requestSnapshot,
      response: err.response
        ? { status: err.response.status, data: err.response.data }
        : { status: null, data: { error: err.message } },
    };
  }
}

module.exports = { sms_gonder, normalizeNumber, KOD_ACIKLAMA, NETGSM_REST_URL };
