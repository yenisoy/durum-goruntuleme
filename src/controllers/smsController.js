const { configOku, configKaydet, topluSmsSend, mesajOlustur, telefonNetgsmFormat } = require('../services/smsService');
const pool = require('../config/database');

async function configGetir(req, res) {
  try {
    const config = await configOku();
    // Şifreyi maskele
    if (config.password) config.password = '••••••••';
    res.json({ basarili: true, config });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function configGuncelle(req, res) {
  const { username, password, appname, msgheader } = req.body;
  if (!username || !msgheader) {
    return res.status(400).json({ basarili: false, mesaj: 'Kullanıcı adı ve gönderici başlığı zorunludur.' });
  }
  try {
    // Şifre ••• ise mevcut şifreyi koru
    let gercekSifre = password;
    if (!password || password === '••••••••') {
      const mevcut = await configOku();
      gercekSifre = mevcut.password === '••••••••' ? mevcut._rawPassword : mevcut.password;
      // Şifreyi ham al
      const pool2 = require('../config/database');
      const r = await pool2.query("SELECT deger FROM ayarlar WHERE anahtar = 'netgsm_password'");
      gercekSifre = r.rowCount > 0 ? r.rows[0].deger : '';
    }
    await configKaydet({ username, password: gercekSifre, appname: appname || '', msgheader });
    res.json({ basarili: true, mesaj: 'Ayarlar kaydedildi.' });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function onizleme(req, res) {
  const { template, bagisci_id } = req.body;
  if (!template) return res.status(400).json({ basarili: false, mesaj: 'Template boş.' });
  try {
    let bagisci = { ad_soyad: 'Örnek Bağışçı', uniq_kod: 'AB12CD34' };
    if (bagisci_id) {
      const r = await pool.query('SELECT ad_soyad, uniq_kod FROM bagiscilar WHERE id = $1', [bagisci_id]);
      if (r.rowCount > 0) bagisci = r.rows[0];
    }
    res.json({ basarili: true, onizleme: mesajOlustur(template, bagisci), karakter: mesajOlustur(template, bagisci).length });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function smsSend(req, res) {
  const { bagisci_ids, template, aralik_ms } = req.body;
  if (!bagisci_ids || !Array.isArray(bagisci_ids) || bagisci_ids.length === 0) {
    return res.status(400).json({ basarili: false, mesaj: 'En az bir bağışçı seçin.' });
  }
  if (!template || !template.trim()) {
    return res.status(400).json({ basarili: false, mesaj: 'Mesaj şablonu boş olamaz.' });
  }
  const aralik = Math.max(0, Math.min(60000, parseInt(aralik_ms) || 500));
  try {
    const sonuc = await topluSmsSend(bagisci_ids, template, aralik);
    res.json({ basarili: true, sonuc });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

module.exports = { configGetir, configGuncelle, onizleme, smsSend };
