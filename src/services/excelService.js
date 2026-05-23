const ExcelJS = require('exceljs');

const SUTUN_MAP = {
  'id': 'ID',
  'adi soyadi': 'ad_soyad',
  'adı soyadı': 'ad_soyad',
  'adi soyadı': 'ad_soyad',
  'adı soyadi': 'ad_soyad',
  'cep telefonu': 'cep_telefonu',
  'kimin adina': 'kimin_adina',
  'kimin adına': 'kimin_adina',
  // Referans sütunları — hem "Referans" hem "2. Referans" formatını destekle
  'referans': 'referans',
  'referans no': 'referans_no',
  '2. referans': 'referans',
  '2. referans no': 'referans_no',
  '2.referans': 'referans',
  '2.referans no': 'referans_no',
  'ikinci referans': 'referans',
  'ikinci referans no': 'referans_no',
  'durum': 'durum',
};

function sutunNormalize(baslik) {
  return String(baslik)
    .toLowerCase()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/Ş/g, 'ş')
    .replace(/Ğ/g, 'ğ')
    .replace(/Ü/g, 'ü')
    .replace(/Ö/g, 'ö')
    .replace(/Ç/g, 'ç')
    .trim();
}

async function excelOku(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Excel dosyasında sayfa bulunamadı.');

  const satirlar = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    satirlar.push({ rowNumber, values: row.values });
  });

  if (satirlar.length < 2) {
    throw new Error('Excel dosyası boş veya başlık satırı eksik.');
  }

  // ExcelJS row.values dizisi 1-indexed (index 0 boş)
  const baslikSatiri = satirlar[0].values.slice(1);
  const kolonlar = baslikSatiri.map((b) => {
    if (!b) return null;
    const norm = sutunNormalize(String(b));
    return SUTUN_MAP[norm] || null;
  });

  // Zorunlu sütun kontrolü
  const zorunlu = [
    { alan: 'ID', etiket: 'ID' },
    { alan: 'ad_soyad', etiket: 'Adı Soyadı' },
    { alan: 'cep_telefonu', etiket: 'Cep Telefonu' },
  ];
  for (const z of zorunlu) {
    if (!kolonlar.includes(z.alan)) {
      throw new Error(`Zorunlu sütun bulunamadı: "${z.etiket}". Lütfen Excel başlıklarını kontrol edin.`);
    }
  }

  const veriSatirlari = [];
  for (let i = 1; i < satirlar.length; i++) {
    const { rowNumber, values } = satirlar[i];
    const satirDegerleri = values.slice(1);

    // Tamamen boş satırları atla
    const dolu = satirDegerleri.some((v) => v !== null && v !== undefined && String(v).trim() !== '');
    if (!dolu) continue;

    const veri = {};
    kolonlar.forEach((alan, idx) => {
      if (alan) {
        const deger = satirDegerleri[idx];
        veri[alan] = deger !== undefined && deger !== null ? String(deger).trim() : '';
      }
    });

    veriSatirlari.push({ satirNo: rowNumber, veri });
  }

  return veriSatirlari;
}

module.exports = { excelOku };
