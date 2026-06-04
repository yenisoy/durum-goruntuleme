const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

function secretKeyUret() {
  return crypto.randomBytes(24).toString('base64url'); // 32 karakter
}

async function bulById(id) {
  const r = await pool.query('SELECT * FROM kullanicilar WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function bulByKullaniciAdi(kullaniciAdi) {
  const r = await pool.query('SELECT * FROM kullanicilar WHERE kullanici_adi = $1', [kullaniciAdi]);
  return r.rows[0] || null;
}

async function bulBySecretKey(secretKey) {
  const r = await pool.query('SELECT * FROM kullanicilar WHERE secret_key = $1', [secretKey]);
  return r.rows[0] || null;
}

async function listele() {
  const r = await pool.query(
    `SELECT id, kullanici_adi, secret_key, rol, created_at, updated_at,
       (SELECT COUNT(*)::int FROM bagiscilar WHERE kullanici_id = k.id) AS bagisci_sayisi,
       (SELECT COUNT(*)::int FROM bagislar WHERE kullanici_id = k.id) AS bagis_sayisi
     FROM kullanicilar k
     ORDER BY (rol = 'admin') DESC, created_at ASC`
  );
  return r.rows;
}

async function olustur({ kullanici_adi, sifre, rol = 'user' }) {
  if (!kullanici_adi || !sifre) throw new Error('Kullanıcı adı ve şifre zorunludur.');
  if (sifre.length < 6) throw new Error('Şifre en az 6 karakter olmalı.');

  const mevcut = await bulByKullaniciAdi(kullanici_adi);
  if (mevcut) throw new Error('Bu kullanıcı adı zaten kullanılıyor.');

  const sifreHash = await bcrypt.hash(sifre, 10);
  const secretKey = secretKeyUret();

  const r = await pool.query(
    `INSERT INTO kullanicilar (kullanici_adi, sifre_hash, secret_key, rol)
     VALUES ($1, $2, $3, $4)
     RETURNING id, kullanici_adi, secret_key, rol, created_at`,
    [kullanici_adi, sifreHash, secretKey, rol === 'admin' ? 'admin' : 'user']
  );
  return r.rows[0];
}

async function sil(id) {
  // Son admin silinmesin
  const adminSayim = await pool.query("SELECT COUNT(*)::int AS sayi FROM kullanicilar WHERE rol = 'admin'");
  const hedef = await bulById(id);
  if (!hedef) throw new Error('Kullanıcı bulunamadı.');
  if (hedef.rol === 'admin' && adminSayim.rows[0].sayi <= 1) {
    throw new Error('Sistemde en az bir admin olmalı.');
  }
  await pool.query('DELETE FROM kullanicilar WHERE id = $1', [id]);
}

async function sifreDegistir(id, yeniSifre) {
  if (!yeniSifre || yeniSifre.length < 6) throw new Error('Şifre en az 6 karakter olmalı.');
  const sifreHash = await bcrypt.hash(yeniSifre, 10);
  await pool.query(
    'UPDATE kullanicilar SET sifre_hash = $1, updated_at = NOW() WHERE id = $2',
    [sifreHash, id]
  );
}

async function secretKeyYenile(id) {
  const yeni = secretKeyUret();
  const r = await pool.query(
    'UPDATE kullanicilar SET secret_key = $1, updated_at = NOW() WHERE id = $2 RETURNING secret_key',
    [yeni, id]
  );
  return r.rows[0]?.secret_key;
}

async function netgsmConfigOku(kullaniciId) {
  const r = await pool.query(
    `SELECT netgsm_username, netgsm_password, netgsm_appname, netgsm_msgheader, netgsm_partnercode
     FROM kullanicilar WHERE id = $1`,
    [kullaniciId]
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  return {
    username: row.netgsm_username || '',
    password: row.netgsm_password || '',
    appname: row.netgsm_appname || '',
    msgheader: row.netgsm_msgheader || '',
    partnercode: row.netgsm_partnercode || '',
  };
}

async function netgsmConfigKaydet(kullaniciId, { username, password, appname, msgheader, partnercode }) {
  // Şifre boşsa mevcut şifreyi koru
  if (!password) {
    const mevcut = await netgsmConfigOku(kullaniciId);
    password = mevcut?.password || '';
  }
  await pool.query(
    `UPDATE kullanicilar SET
       netgsm_username = $1, netgsm_password = $2,
       netgsm_appname = $3, netgsm_msgheader = $4,
       netgsm_partnercode = $5,
       updated_at = NOW()
     WHERE id = $6`,
    [username || '', password || '', appname || '', msgheader || '', partnercode || '', kullaniciId]
  );
}

async function dogrula(kullaniciAdi, sifre) {
  const k = await bulByKullaniciAdi(kullaniciAdi);
  if (!k) return null;
  const eslesme = await bcrypt.compare(sifre, k.sifre_hash);
  return eslesme ? k : null;
}

module.exports = {
  bulById, bulByKullaniciAdi, bulBySecretKey,
  listele, olustur, sil,
  sifreDegistir, secretKeyYenile,
  netgsmConfigOku, netgsmConfigKaydet,
  dogrula,
  secretKeyUret,
};
