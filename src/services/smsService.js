const Netgsm = require('@netgsm/sms').default;
const pool = require('../config/database');

const AYAR_KEYS = ['netgsm_username', 'netgsm_password', 'netgsm_appname', 'netgsm_msgheader'];

async function configOku() {
  const result = await pool.query(
    'SELECT anahtar, deger FROM ayarlar WHERE anahtar = ANY($1)',
    [AYAR_KEYS]
  );
  const config = {};
  result.rows.forEach(r => { config[r.anahtar] = r.deger; });
  return {
    username: config.netgsm_username || '',
    password: config.netgsm_password || '',
    appname: config.netgsm_appname || '',
    msgheader: config.netgsm_msgheader || '',
  };
}

async function configKaydet(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const key of AYAR_KEYS) {
      const deger = data[key.replace('netgsm_', '')] ?? '';
      await client.query(
        `INSERT INTO ayarlar (anahtar, deger, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (anahtar) DO UPDATE SET deger = $2, updated_at = NOW()`,
        [key, deger]
      );
    }
    await client.query('COMMIT');
  } finally {
    client.release();
  }
}

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

async function topluSmsSend(bagisciIds, template, aralikMs) {
  const config = await configOku();
  if (!config.username || !config.password || !config.msgheader) {
    throw new Error('Netgsm yapılandırması eksik. Lütfen ayarları kontrol edin.');
  }

  const netgsm = new Netgsm({
    username: config.username,
    password: config.password,
    appname: config.appname || undefined,
  });

  const bagiscilar = await pool.query(
    'SELECT id, ad_soyad, telefon, uniq_kod FROM bagiscilar WHERE id = ANY($1) AND telefon IS NOT NULL',
    [bagisciIds]
  );

  const sonuclar = { basarili: 0, basarisiz: 0, atlanan: 0, detay: [] };

  for (let i = 0; i < bagiscilar.rows.length; i++) {
    const bagisci = bagiscilar.rows[i];
    const tel = telefonNetgsmFormat(bagisci.telefon);

    if (!tel) {
      sonuclar.atlanan++;
      sonuclar.detay.push({ id: bagisci.id, ad: bagisci.ad_soyad, durum: 'atlandı', sebep: 'Geçersiz telefon' });
      continue;
    }

    const mesaj = mesajOlustur(template, bagisci);

    try {
      await netgsm.sendRestSms({
        msgheader: config.msgheader,
        encoding: 'TR',
        messages: [{ msg: mesaj, no: tel }],
      });
      sonuclar.basarili++;
      sonuclar.detay.push({ id: bagisci.id, ad: bagisci.ad_soyad, tel, durum: 'gönderildi' });
    } catch (err) {
      sonuclar.basarisiz++;
      sonuclar.detay.push({ id: bagisci.id, ad: bagisci.ad_soyad, tel, durum: 'hata', sebep: err.message });
    }

    // Son eleman değilse bekle
    if (i < bagiscilar.rows.length - 1 && aralikMs > 0) {
      await new Promise(r => setTimeout(r, aralikMs));
    }
  }

  return sonuclar;
}

module.exports = { configOku, configKaydet, topluSmsSend, mesajOlustur, telefonNetgsmFormat };
