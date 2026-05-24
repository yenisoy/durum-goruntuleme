const Netgsm = require('@netgsm/sms').default;
const pool = require('../config/database');
const k = require('./kullaniciService');

// Sadece ülke kodu olan numaraları kabul eder, 90 prefix'ini striperek döner
function telefonNetgsmFormat(ham, ulkeKoduVarMi) {
  if (!ulkeKoduVarMi) return null; // ülke kodu yoksa SMS gönderme
  if (!ham) return null;
  const tel = String(ham).replace(/\D/g, '');
  if (tel.startsWith('90') && tel.length === 12) {
    const local = tel.slice(2); // 90 prefix'ini at
    if (local.startsWith('5') && local.length === 10) return local;
  }
  return null;
}

function mesajOlustur(template, bagisci) {
  return template
    .replace(/\{BAGISCI_ADI_SOYADI\}/g, bagisci.ad_soyad || '')
    .replace(/\{UNIQ_KOD\}/g, bagisci.uniq_kod || '');
}

function hataDetayCikar(err) {
  if (!err) return 'Bilinmeyen hata';
  if (typeof err === 'string') return err;
  if (typeof err !== 'object') return String(err);

  // Netgsm yanıt formatı
  if (err.response && err.response.data) {
    const d = err.response.data;
    if (typeof d === 'object') {
      const parcalar = [];
      if (d.code) parcalar.push(`Kod: ${d.code}`);
      if (d.description) parcalar.push(d.description);
      if (d.error) parcalar.push(d.error);
      if (parcalar.length) return parcalar.join(' — ');
      try { return JSON.stringify(d).slice(0, 250); } catch { return ''; }
    }
    return String(d).slice(0, 250);
  }
  if (err.description) return err.description;
  if (err.code && err.message) return `Kod ${err.code}: ${err.message}`;
  if (err.code) return `Hata kodu: ${err.code}`;
  if (err.message) return err.message;

  try { return JSON.stringify(err).slice(0, 250); } catch { return 'Hata detayı alınamadı'; }
}

// Netgsm response code'unu kontrol et
function netgsmResponseKontrol(response) {
  if (!response) return;
  // SDK'nın döndürdüğü yapı: { code, jobid, description? }
  const code = response.code || (response.data && response.data.code);
  if (code && String(code) !== '00') {
    const desc = response.description || (response.data && response.data.description);
    throw new Error(`Netgsm reddetti — kod ${code}${desc ? ': ' + desc : ''}`);
  }
}

async function topluSmsSend(kullaniciId, bagisciIds, template, aralikMs) {
  const config = await k.netgsmConfigOku(kullaniciId);
  if (!config || !config.username || !config.password || !config.msgheader) {
    throw new Error('Netgsm yapılandırması eksik. Lütfen ayarları kontrol edin.');
  }

  const netgsm = new Netgsm({
    username: config.username,
    password: config.password,
    appname: config.appname || undefined,
  });

  // SADECE kullanıcının kendi bağışçıları + ülke kodu olanlar
  const bagiscilar = await pool.query(
    `SELECT id, ad_soyad, telefon, ulke_kodu_var_mi, uniq_kod FROM bagiscilar
     WHERE kullanici_id = $1 AND id = ANY($2) AND telefon IS NOT NULL`,
    [kullaniciId, bagisciIds]
  );

  const sonuclar = { basarili: 0, basarisiz: 0, atlanan: 0, detay: [] };

  for (let i = 0; i < bagiscilar.rows.length; i++) {
    const b = bagiscilar.rows[i];
    const tel = telefonNetgsmFormat(b.telefon, b.ulke_kodu_var_mi);

    if (!tel) {
      sonuclar.atlanan++;
      sonuclar.detay.push({
        id: b.id, ad: b.ad_soyad, tel: b.telefon,
        durum: 'atlandı',
        sebep: b.ulke_kodu_var_mi
          ? 'Telefon formatı geçersiz (5XXXXXXXXX bekleniyor)'
          : 'Ülke kodu (90) yok — sadece 90 prefixli numaralara gönderilir',
      });
      continue;
    }

    const mesaj = mesajOlustur(template, b);

    try {
      const response = await netgsm.sendRestSms({
        msgheader: config.msgheader,
        encoding: 'TR',
        messages: [{ msg: mesaj, no: tel }],
      });
      netgsmResponseKontrol(response);
      sonuclar.basarili++;
      sonuclar.detay.push({ id: b.id, ad: b.ad_soyad, tel, durum: 'gönderildi' });
    } catch (err) {
      sonuclar.basarisiz++;
      sonuclar.detay.push({
        id: b.id, ad: b.ad_soyad, tel,
        durum: 'hata',
        sebep: hataDetayCikar(err),
      });
    }

    if (i < bagiscilar.rows.length - 1 && aralikMs > 0) {
      await new Promise(r => setTimeout(r, aralikMs));
    }
  }

  return sonuclar;
}

module.exports = { topluSmsSend, mesajOlustur, telefonNetgsmFormat };
