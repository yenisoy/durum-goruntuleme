const pool = require('../config/database');
const k = require('./kullaniciService');
const { sms_gonder } = require('./netgsmService');

// Netgsm'e sadece Türkiye numarası gider (ülke kodu olan 90 + 5XXXXXXXXX)
function telefonNetgsmFormat(ham, ulkeKoduVarMi) {
  if (!ulkeKoduVarMi) return null;
  if (!ham) return null;
  const tel = String(ham).replace(/\D/g, '');
  if (tel.startsWith('90') && tel.length === 12) {
    return tel; // sms_gonder normalize edecek; biz 905XXX formatında veriyoruz
  }
  return null;
}

function mesajOlustur(template, bagisci) {
  return template
    .replace(/\{BAGISCI_ADI_SOYADI\}/g, bagisci.ad_soyad || '')
    .replace(/\{UNIQ_KOD\}/g, bagisci.uniq_kod || '')
    .replace(/\{CRM_KOD\}/g, bagisci.crm_kod || '');
}

/**
 * Toplu SMS gönderim — her bağışçı için ayrı istek atar (rate limit + per-recipient log için)
 * @param {number} kullaniciId
 * @param {number[]} bagisciIds
 * @param {string} template
 * @param {number} aralikMs
 * @param {string} iysfilter - '0' (bilgilendirme) veya '' (ticari, partnercode gerekli)
 */
async function topluSmsSend(kullaniciId, bagisciIds, template, aralikMs, iysfilter = '0') {
  const cfg = await k.netgsmConfigOku(kullaniciId);
  if (!cfg || !cfg.username || !cfg.password || !cfg.msgheader) {
    throw new Error('Netgsm yapılandırması eksik. Lütfen ayarları kontrol edin.');
  }

  // Ticari mesaj seçildiyse partnercode olmadan gönderme
  if (iysfilter === '' && !cfg.partnercode) {
    throw new Error('Ticari mesaj göndermek için Partner Code (İYS marka kodu) tanımlı olmalı.');
  }

  const netgsmConfig = {
    usercode: cfg.username,
    password: cfg.password,
    header: cfg.msgheader,
    iysfilter: iysfilter,
    partnercode: cfg.partnercode || undefined,
    encoding: 'TR',
  };

  const bagiscilar = await pool.query(
    `SELECT id, ad_soyad, telefon, ulke_kodu_var_mi, uniq_kod, crm_kod FROM bagiscilar
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
          ? 'Telefon formatı geçersiz (905XXXXXXXXX bekleniyor)'
          : 'Ülke kodu (90) yok',
      });
      continue;
    }

    const mesaj = mesajOlustur(template, b);

    const sonuc = await sms_gonder(netgsmConfig, tel, mesaj);

    if (sonuc.success) {
      sonuclar.basarili++;
      sonuclar.detay.push({
        id: b.id, ad: b.ad_soyad, tel,
        durum: 'gönderildi',
        kod: sonuc.code,
        jobid: sonuc.jobid,
      });
    } else {
      sonuclar.basarisiz++;
      sonuclar.detay.push({
        id: b.id, ad: b.ad_soyad, tel,
        durum: 'hata',
        kod: sonuc.code,
        sebep: `[${sonuc.code}] ${sonuc.description}`,
      });
    }

    if (i < bagiscilar.rows.length - 1 && aralikMs > 0) {
      await new Promise(r => setTimeout(r, aralikMs));
    }
  }

  return sonuclar;
}

module.exports = { topluSmsSend, mesajOlustur, telefonNetgsmFormat };
