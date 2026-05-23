const pool = require('../config/database');
const { excelOku } = require('./excelService');
const { bulVeyaOlustur } = require('./bagisciService');
const { normalizeDurum } = require('./durumService');
const { normalizeTelefon } = require('./telefonService');

async function excelImport(buffer, varsayilanDurum = 'bekliyor', kullaniciId) {
  if (!kullaniciId) throw new Error('Kullanıcı kimliği gerekli.');

  const satirlar = await excelOku(buffer);
  const ozet = {
    toplamSatir: satirlar.length,
    olusturulanBagisci: 0,
    bulunanBagisci: 0,
    olusturulanBagis: 0,
    guncellenenBagis: 0,
    hataSayisi: 0,
    hataliSatirlar: [],
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const { satirNo, veri } of satirlar) {
      try {
        if (!veri.ID || !veri.ad_soyad || !veri.cep_telefonu) {
          const eksikler = [];
          if (!veri.ID) eksikler.push('ID');
          if (!veri.ad_soyad) eksikler.push('Adı Soyadı');
          if (!veri.cep_telefonu) eksikler.push('Cep Telefonu');
          throw new Error(`Zorunlu alanlar eksik: ${eksikler.join(', ')}`);
        }

        let durum;
        if (veri.durum) {
          durum = normalizeDurum(veri.durum);
          if (!durum) throw new Error(`Geçersiz durum: "${veri.durum}"`);
        } else {
          durum = varsayilanDurum;
        }

        const { bagisci, yeniOlusturuldu } = await bulVeyaOlustur(
          client, kullaniciId, veri.ad_soyad, veri.cep_telefonu
        );
        if (yeniOlusturuldu) ozet.olusturulanBagisci++; else ozet.bulunanBagisci++;

        let referansId = null;
        if (veri.referans_no && String(veri.referans_no).trim()) {
          const { bagisci: ref } = await bulVeyaOlustur(
            client, kullaniciId, veri.referans || 'Bilinmiyor', veri.referans_no
          );
          referansId = ref.id;
        }

        const { ulke_kodu_var_mi } = normalizeTelefon(veri.cep_telefonu);

        const mevcut = await client.query(
          'SELECT id FROM bagislar WHERE kullanici_id = $1 AND excel_id = $2',
          [kullaniciId, veri.ID]
        );

        if (mevcut.rowCount > 0) {
          await client.query(
            `UPDATE bagislar SET
              ad_soyad = $1, cep_telefonu = $2, cep_no_ulke_kodu_var_mi = $3,
              kimin_adina = $4, ikinci_ref = $5, ikinci_ref_cep_no = $6,
              durum = $7, bagisci_id = $8, referans_id = $9, updated_at = NOW()
            WHERE kullanici_id = $10 AND excel_id = $11`,
            [veri.ad_soyad, veri.cep_telefonu, ulke_kodu_var_mi,
              veri.kimin_adina || null, veri.referans || null, veri.referans_no || null,
              durum, bagisci.id, referansId, kullaniciId, veri.ID]
          );
          ozet.guncellenenBagis++;
        } else {
          await client.query(
            `INSERT INTO bagislar
              (kullanici_id, excel_id, ad_soyad, cep_telefonu, cep_no_ulke_kodu_var_mi,
               kimin_adina, ikinci_ref, ikinci_ref_cep_no, durum, bagisci_id, referans_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [kullaniciId, veri.ID, veri.ad_soyad, veri.cep_telefonu, ulke_kodu_var_mi,
              veri.kimin_adina || null, veri.referans || null, veri.referans_no || null,
              durum, bagisci.id, referansId]
          );
          ozet.olusturulanBagis++;
        }
      } catch (e) {
        ozet.hataSayisi++;
        ozet.hataliSatirlar.push({ satirNo, ID: veri.ID || '-', hata: e.message });
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

module.exports = { excelImport };
