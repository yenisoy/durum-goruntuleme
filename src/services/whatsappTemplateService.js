const pool = require('../config/database');

async function listele(kullaniciId) {
  const r = await pool.query(
    'SELECT * FROM whatsapp_templates WHERE kullanici_id = $1 ORDER BY ad ASC',
    [kullaniciId]
  );
  return r.rows;
}

async function bul(kullaniciId, id) {
  const r = await pool.query(
    'SELECT * FROM whatsapp_templates WHERE kullanici_id = $1 AND id = $2',
    [kullaniciId, id]
  );
  return r.rows[0] || null;
}

const GECERLI_KATEGORILER = ['UTILITY', 'MARKETING', 'AUTHENTICATION'];

function kategoriDogrula(k) {
  const v = String(k || 'UTILITY').toUpperCase();
  return GECERLI_KATEGORILER.includes(v) ? v : 'UTILITY';
}

async function olustur(kullaniciId, { ad, dil_kodu, kategori, components }) {
  if (!ad) throw new Error('Template adı zorunludur.');
  const r = await pool.query(
    `INSERT INTO whatsapp_templates (kullanici_id, ad, dil_kodu, kategori, components)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [kullaniciId, ad, dil_kodu || 'tr', kategoriDogrula(kategori), JSON.stringify(components || [])]
  );
  return r.rows[0];
}

async function guncelle(kullaniciId, id, { ad, dil_kodu, kategori, components }) {
  const r = await pool.query(
    `UPDATE whatsapp_templates SET
       ad = COALESCE($1, ad),
       dil_kodu = COALESCE($2, dil_kodu),
       kategori = COALESCE($3, kategori),
       components = COALESCE($4, components),
       updated_at = NOW()
     WHERE kullanici_id = $5 AND id = $6
     RETURNING *`,
    [ad, dil_kodu, kategori ? kategoriDogrula(kategori) : null,
     components ? JSON.stringify(components) : null, kullaniciId, id]
  );
  if (r.rowCount === 0) throw new Error('Template bulunamadı.');
  return r.rows[0];
}

async function sil(kullaniciId, id) {
  await pool.query(
    'DELETE FROM whatsapp_templates WHERE kullanici_id = $1 AND id = $2',
    [kullaniciId, id]
  );
}

function bodyVariableSayisi(components) {
  if (!Array.isArray(components)) return 0;
  const body = components.find(c => c.type === 'BODY');
  if (!body || !body.variables) return 0;
  return body.variables.length;
}

function headerVarMi(components) {
  if (!Array.isArray(components)) return false;
  return components.some(c => c.type === 'HEADER');
}

module.exports = {
  listele, bul, olustur, guncelle, sil,
  bodyVariableSayisi, headerVarMi,
  GECERLI_KATEGORILER, kategoriDogrula,
};
