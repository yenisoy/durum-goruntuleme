const Netgsm = require('@netgsm/sms').default;
const pool = require('../config/database');
const k = require('./kullaniciService');

function telefonNetgsmFormat(ham) {
  if (!ham) return null;
  let tel = String(ham).replace(/\D/g, '');
  if (tel.startsWith('90') && tel.length === 12) tel = tel.slice(2);
  if (tel.startsWith('0') && tel.length === 11) tel = tel.slice(1);
  if (tel.length === 10 && tel.startsWith('5')) return tel;
  return null;
}

function mesajOlustur(template, bagisci) {
  return template
    .replace(/\{BAGISCI_ADI_SOYADI\}/g, bagisci.ad_soyad || '')
    .replace(/\{UNIQ_KOD\}/g, bagisci.uniq_kod || '');
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

  // SADECE kullanıcının kendi bağışçılarına SMS gidebilir
  const bagiscilar = await pool.query(
    `SELECT id, ad_soyad, telefon, uniq_kod FROM bagiscilar
     WHERE kullanici_id = $1 AND id = ANY($2) AND telefon IS NOT NULL`,
    [kullaniciId, bagisciIds]
  );

  const sonuclar = { basarili: 0, basarisiz: 0, atlanan: 0, detay: [] };

  for (let i = 0; i < bagiscilar.rows.length; i++) {
    const b = bagiscilar.rows[i];
    const tel = telefonNetgsmFormat(b.telefon);

    if (!tel) {
      sonuclar.atlanan++;
      sonuclar.detay.push({ id: b.id, ad: b.ad_soyad, durum: 'atlandı', sebep: 'Geçersiz telefon' });
      continue;
    }

    const mesaj = mesajOlustur(template, b);

    try {
      await netgsm.sendRestSms({ msgheader: config.msgheader, encoding: 'TR', messages: [{ msg: mesaj, no: tel }] });
      sonuclar.basarili++;
      sonuclar.detay.push({ id: b.id, ad: b.ad_soyad, tel, durum: 'gönderildi' });
    } catch (err) {
      sonuclar.basarisiz++;
      sonuclar.detay.push({ id: b.id, ad: b.ad_soyad, tel, durum: 'hata', sebep: err.message });
    }

    if (i < bagiscilar.rows.length - 1 && aralikMs > 0) {
      await new Promise(r => setTimeout(r, aralikMs));
    }
  }

  return sonuclar;
}

module.exports = { topluSmsSend, mesajOlustur, telefonNetgsmFormat };
