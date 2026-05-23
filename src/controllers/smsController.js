const k = require('../services/kullaniciService');
const { topluSmsSend, mesajOlustur } = require('../services/smsService');
const pool = require('../config/database');

async function configGetir(req, res) {
  try {
    const cfg = await k.netgsmConfigOku(req.session.kullaniciId);
    if (!cfg) return res.json({ basarili: true, config: { username: '', appname: '', msgheader: '', password: '' } });
    if (cfg.password) cfg.password = '••••••••';
    res.json({ basarili: true, config: cfg });
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
    const gercekSifre = (!password || password === '••••••••') ? null : password;
    await k.netgsmConfigKaydet(req.session.kullaniciId, {
      username, password: gercekSifre, appname: appname || '', msgheader,
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
    let b = { ad_soyad: 'Örnek Bağışçı', uniq_kod: 'AB12CD34' };
    if (bagisci_id) {
      const r = await pool.query(
        'SELECT ad_soyad, uniq_kod FROM bagiscilar WHERE id = $1 AND kullanici_id = $2',
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
  const { bagisci_ids, template, aralik_ms } = req.body;
  if (!Array.isArray(bagisci_ids) || bagisci_ids.length === 0) {
    return res.status(400).json({ basarili: false, mesaj: 'En az bir bağışçı seçin.' });
  }
  if (!template || !template.trim()) {
    return res.status(400).json({ basarili: false, mesaj: 'Mesaj şablonu boş olamaz.' });
  }
  const aralik = Math.max(0, Math.min(60000, parseInt(aralik_ms) || 500));
  try {
    const sonuc = await topluSmsSend(req.session.kullaniciId, bagisci_ids, template, aralik);
    res.json({ basarili: true, sonuc });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

module.exports = { configGetir, configGuncelle, onizleme, smsSend };
