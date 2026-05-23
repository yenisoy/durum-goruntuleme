const fs = require('fs');
const path = require('path');

const WIDGET_PATH = path.join(__dirname, '../../public/wordpress-widget.html');

function sablonOku() {
  return fs.readFileSync(WIDGET_PATH, 'utf8');
}

async function sablonGetir(req, res) {
  try {
    res.json({ basarili: true, sablon: sablonOku() });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: 'Şablon okunamadı.' });
  }
}

async function widgetIndir(req, res) {
  const { api_url, secret_key } = req.query;

  if (!api_url || !secret_key) {
    return res.status(400).send('api_url ve secret_key parametreleri zorunludur.');
  }

  try {
    const sablon = sablonOku()
      .replace(/\{\{API_URL\}\}/g, String(api_url).replace(/\/$/, ''))
      .replace(/\{\{SECRET_KEY\}\}/g, String(secret_key));

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="bagis-sorgulama-widget.html"');
    res.send(sablon);
  } catch (err) {
    res.status(500).send('Widget oluşturulamadı.');
  }
}

module.exports = { sablonGetir, widgetIndir };
