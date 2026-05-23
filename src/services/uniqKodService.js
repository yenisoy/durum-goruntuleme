const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const KOD_UZUNLUK = 8;
const MAX_DENEME = 20;

function generateKod() {
  let kod = '';
  for (let i = 0; i < KOD_UZUNLUK; i++) {
    kod += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return kod;
}

async function uniqueKodUret(client, kullaniciId) {
  for (let i = 0; i < MAX_DENEME; i++) {
    const kod = generateKod();
    const r = await client.query(
      'SELECT id FROM bagiscilar WHERE kullanici_id = $1 AND uniq_kod = $2',
      [kullaniciId, kod]
    );
    if (r.rowCount === 0) return kod;
  }
  throw new Error('Benzersiz kod üretilemedi, lütfen tekrar deneyin.');
}

module.exports = { uniqueKodUret };
