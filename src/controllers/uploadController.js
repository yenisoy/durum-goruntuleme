const { excelImport } = require('../services/importService');
const { GECERLI_DURUMLAR } = require('../services/durumService');

async function excelYukle(req, res) {
  if (!req.file) return res.status(400).json({ basarili: false, mesaj: 'Excel dosyası yüklenmedi.' });

  const varsayilanDurum = req.body.varsayilan_durum || 'bekliyor';
  if (!GECERLI_DURUMLAR.includes(varsayilanDurum)) {
    return res.status(400).json({ basarili: false, mesaj: `Geçersiz durum: ${varsayilanDurum}` });
  }

  try {
    const ozet = await excelImport(req.file.buffer, varsayilanDurum, req.session.kullaniciId);
    res.json({ basarili: true, mesaj: 'Excel başarıyla işlendi.', ozet });
  } catch (err) {
    console.error('Excel yükleme hatası:', err.message);
    res.status(500).json({ basarili: false, mesaj: err.message || 'Bilinmeyen hata.' });
  }
}

module.exports = { excelYukle };
