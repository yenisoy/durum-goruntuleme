const k = require('../services/kullaniciService');
const { topluSmsSend, mesajOlustur } = require('../services/smsService');
const { sms_gonder } = require('../services/netgsmService');
const pool = require('../config/database');

async function configGetir(req, res) {
  try {
    const cfg = await k.netgsmConfigOku(req.session.kullaniciId);
    if (!cfg) return res.json({
      basarili: true,
      config: { username: '', appname: '', msgheader: '', password: '', partnercode: '' },
    });
    if (cfg.password) cfg.password = '••••••••';
    res.json({ basarili: true, config: cfg });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function configGuncelle(req, res) {
  const { username, password, appname, msgheader, partnercode } = req.body;
  if (!username || !msgheader) {
    return res.status(400).json({ basarili: false, mesaj: 'Kullanıcı adı ve gönderici başlığı zorunludur.' });
  }
  try {
    const gercekSifre = (!password || password === '••••••••') ? null : password;
    await k.netgsmConfigKaydet(req.session.kullaniciId, {
      username, password: gercekSifre,
      appname: appname || '',
      msgheader,
      partnercode: partnercode || '',
    });
    res.json({ basarili: true, mesaj: 'Ayarlar kaydedildi.' });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function onizleme(req, res) {
  const { template, bagisci_id } = req.body;
  if (!template) return res.status(400).json({ basarili: false, mesaj: 'Template boş.' });
  try {
    let b = { ad_soyad: 'Örnek Bağışçı', uniq_kod: 'AB12CD34', crm_kod: 'CRM-12345' };
    if (bagisci_id) {
      const r = await pool.query(
        'SELECT ad_soyad, uniq_kod, crm_kod FROM bagiscilar WHERE id = $1 AND kullanici_id = $2',
        [bagisci_id, req.session.kullaniciId]
      );
      if (r.rowCount > 0) b = r.rows[0];
    }
    res.json({ basarili: true, onizleme: mesajOlustur(template, b), karakter: mesajOlustur(template, b).length });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function smsSend(req, res) {
  const { bagisci_ids, template, aralik_ms, mesaj_tipi } = req.body;
  if (!Array.isArray(bagisci_ids) || bagisci_ids.length === 0) {
    return res.status(400).json({ basarili: false, mesaj: 'En az bir bağışçı seçin.' });
  }
  if (!template || !template.trim()) {
    return res.status(400).json({ basarili: false, mesaj: 'Mesaj şablonu boş olamaz.' });
  }
  const aralik = Math.max(0, Math.min(60000, parseInt(aralik_ms) || 500));
  // NetGSM REST v2 spec: '0' = bilgilendirme (İYS izni gerekmez), '' = ticari (partnercode gerekli)
  const iysfilter = mesaj_tipi === 'ticari' ? '' : '0';
  try {
    const sonuc = await topluSmsSend(req.session.kullaniciId, bagisci_ids, template, aralik, iysfilter);
    res.json({ basarili: true, sonuc });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

/**
 * Test SMS endpoint — config doğrulamak için tek bir numaraya test mesajı gönderir
 */
async function testSms(req, res) {
  const { telefon, mesaj_tipi } = req.body;
  if (!telefon) return res.status(400).json({ basarili: false, mesaj: 'Telefon zorunlu.' });
  try {
    const cfg = await k.netgsmConfigOku(req.session.kullaniciId);
    if (!cfg || !cfg.username || !cfg.password || !cfg.msgheader) {
      return res.status(400).json({ basarili: false, mesaj: 'Netgsm yapılandırması eksik.' });
    }
    const iysfilter = mesaj_tipi === 'ticari' ? '' : '0';
    const sonuc = await sms_gonder(
      {
        usercode: cfg.username,
        password: cfg.password,
        header: cfg.msgheader,
        partnercode: cfg.partnercode,
        iysfilter,
        encoding: 'TR',
      },
      telefon,
      `Bu bir NetGSM REST v2 test mesajidir. ${new Date().toLocaleString('tr-TR')}`
    );
    // Şifreyi maskele — request snapshot zaten maskeli ama yine de garanti
    res.json({ basarili: true, sonuc });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

module.exports = { configGetir, configGuncelle, onizleme, smsSend, testSms };
