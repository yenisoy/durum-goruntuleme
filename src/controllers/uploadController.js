const { excelImport } = require('../services/importService');
const { GECERLI_DURUMLAR } = require('../services/durumService');

async function excelYukle(req, res) {
  if (!req.file) {
    return res.status(400).json({ basarili: false, mesaj: 'Excel dosyası yüklenmedi.' });
  }

  const varsayilanDurum = req.body.varsayilan_durum || 'bekliyor';
  if (!GECERLI_DURUMLAR.includes(varsayilanDurum)) {
    return res.status(400).json({
      basarili: false,
      mesaj: `Geçersiz varsayılan durum: "${varsayilanDurum}". Geçerli değerler: ${GECERLI_DURUMLAR.join(', ')}`,
    });
  }

  try {
    const ozet = await excelImport(req.file.buffer, varsayilanDurum);

    return res.json({
      basarili: true,
      mesaj: 'Excel başarıyla işlendi.',
      ozet,
    });
  } catch (err) {
    console.error('Excel yükleme hatası:', err.message);
    return res.status(500).json({
      basarili: false,
      mesaj: err.message || 'Bilinmeyen bir hata oluştu.',
    });
  }
}

module.exports = { excelYukle };
