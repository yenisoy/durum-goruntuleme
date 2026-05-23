const fs = require('fs');
const path = require('path');
const k = require('../services/kullaniciService');

const WIDGET_PATH = path.join(__dirname, '../../public/wordpress-widget.html');

function sablonOku() {
  return fs.readFileSync(WIDGET_PATH, 'utf8');
}

async function sablonGetir(req, res) {
  try {
    res.json({ basarili: true, sablon: sablonOku() });
  } catch {
    res.status(500).json({ basarili: false, mesaj: 'Şablon okunamadı.' });
  }
}

async function widgetIndir(req, res) {
  const { api_url } = req.query;
  if (!api_url) return res.status(400).send('api_url parametresi zorunludur.');

  try {
    const user = await k.bulById(req.session.kullaniciId);
    if (!user) return res.status(404).send('Kullanıcı bulunamadı.');

    const html = sablonOku()
      .replace(/\{\{API_URL\}\}/g, String(api_url).replace(/\/$/, ''))
      .replace(/\{\{SECRET_KEY\}\}/g, user.secret_key);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="bagis-sorgulama-widget.html"');
    res.send(html);
  } catch {
    res.status(500).send('Widget oluşturulamadı.');
  }
}

module.exports = { sablonGetir, widgetIndir };
