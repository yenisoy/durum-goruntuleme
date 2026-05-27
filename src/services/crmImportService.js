const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const pool = require('../config/database');
const { normalizeTelefon } = require('./telefonService');

function sutunNormalize(baslik) {
  return String(baslik || '')
    .toLowerCase()
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .replace(/Ş/g, 'ş').replace(/Ğ/g, 'ğ')
    .replace(/Ü/g, 'ü').replace(/Ö/g, 'ö').replace(/Ç/g, 'ç')
    .replace(/[_\-./]+/g, ' ')   // alt çizgi/tire vs. boşluk gibi davransın
    .replace(/\s+/g, ' ')         // çoklu boşluk → tek
    .trim();
}

const TEL_KEYS = [
  'telefon', 'cep telefonu', 'cep no', 'cep numarasi', 'cep numarası',
  'gsm', 'gsm no', 'numara', 'phone', 'phone number', 'mobile', 'mobil',
  'tel', 'tel no'
];
const KOD_KEYS = [
  'crm kod', 'crm kodu', 'crm', 'crm code', 'kod', 'code',
  'müşteri kodu', 'musteri kodu', 'musteri kod',
  'mvr uid', 'mvruid', 'mvr id', 'uid', 'müşteri id', 'musteri id',
  'customer id', 'customer code', 'customer uid'
];

async function excelOkuVeIsle(buffer, fileName, kullaniciId) {
  const isCSV = (fileName || '').toLowerCase().endsWith('.csv');
  const wb = new ExcelJS.Workbook();
  let sheet;

  if (isCSV) {
    // ExcelJS CSV reader stream üzerinden çalışıyor
    const stream = Readable.from(buffer);
    sheet = await wb.csv.read(stream);
  } else {
    await wb.xlsx.load(buffer);
    sheet = wb.worksheets[0];
  }

  if (!sheet) throw new Error('Dosyada okunabilecek sayfa bulunamadı.');

  const tumSatirlar = [];
  sheet.eachRow({ includeEmpty: false }, (row, n) => {
    tumSatirlar.push({ n, values: row.values });
  });

  if (tumSatirlar.length < 2) throw new Error('Excel dosyası boş veya başlık satırı eksik.');

  const baslikSatiri = tumSatirlar[0].values.slice(1).map(b => sutunNormalize(b));
  let telIdx = -1, kodIdx = -1;
  baslikSatiri.forEach((b, i) => {
    if (telIdx === -1 && TEL_KEYS.includes(b)) telIdx = i;
    if (kodIdx === -1 && KOD_KEYS.includes(b)) kodIdx = i;
  });

  if (telIdx === -1) throw new Error('Telefon sütunu bulunamadı (telefon / cep telefonu / gsm / phone).');
  if (kodIdx === -1) throw new Error('CRM Kod sütunu bulunamadı (crm kod / crm kodu / kod).');

  const ozet = {
    toplamSatir: tumSatirlar.length - 1,
    eslesen: 0,
    eslesmeyen: 0,
    bos: 0,
    hata: 0,
    eslesmeyenSatirlar: [],
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 1; i < tumSatirlar.length; i++) {
      const { n, values } = tumSatirlar[i];
      const satir = values.slice(1);
      const dolu = satir.some(v => v !== null && v !== undefined && String(v).trim() !== '');
      if (!dolu) { ozet.bos++; continue; }

      const hamTel = satir[telIdx];
      const hamKod = satir[kodIdx];

      if (!hamTel || !hamKod || String(hamKod).trim() === '') {
        ozet.eslesmeyen++;
        ozet.eslesmeyenSatirlar.push({ satirNo: n, telefon: String(hamTel || '-'), crm_kod: String(hamKod || '-'), sebep: 'Boş alan' });
        continue;
      }

      const { telefon } = normalizeTelefon(hamTel);
      if (!telefon) {
        ozet.eslesmeyen++;
        ozet.eslesmeyenSatirlar.push({ satirNo: n, telefon: String(hamTel), crm_kod: String(hamKod), sebep: 'Telefon normalize edilemedi' });
        continue;
      }

      const kod = String(hamKod).trim();

      try {
        const r = await client.query(
          `UPDATE bagiscilar SET crm_kod = $1, updated_at = NOW()
           WHERE kullanici_id = $2 AND telefon = $3
           RETURNING id`,
          [kod, kullaniciId, telefon]
        );
        if (r.rowCount > 0) {
          ozet.eslesen++;
        } else {
          ozet.eslesmeyen++;
          ozet.eslesmeyenSatirlar.push({ satirNo: n, telefon, crm_kod: kod, sebep: 'Bağışçı bulunamadı' });
        }
      } catch (e) {
        ozet.hata++;
        ozet.eslesmeyenSatirlar.push({ satirNo: n, telefon, crm_kod: kod, sebep: e.message });
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return ozet;
}

module.exports = { excelOkuVeIsle };
