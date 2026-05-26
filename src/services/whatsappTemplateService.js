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

async function olustur(kullaniciId, { ad, dil_kodu, components }) {
  if (!ad) throw new Error('Template adı zorunludur.');
  const r = await pool.query(
    `INSERT INTO whatsapp_templates (kullanici_id, ad, dil_kodu, components)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [kullaniciId, ad, dil_kodu || 'tr', JSON.stringify(components || [])]
  );
  return r.rows[0];
}

async function guncelle(kullaniciId, id, { ad, dil_kodu, components }) {
  const r = await pool.query(
    `UPDATE whatsapp_templates SET
       ad = COALESCE($1, ad),
       dil_kodu = COALESCE($2, dil_kodu),
       components = COALESCE($3, components),
       updated_at = NOW()
     WHERE kullanici_id = $4 AND id = $5
     RETURNING *`,
    [ad, dil_kodu, components ? JSON.stringify(components) : null, kullaniciId, id]
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

/**
 * Template components'tan body variable sayısını çıkarır
 */
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

function headerFormat(components) {
  if (!Array.isArray(components)) return null;
  const h = components.find(c => c.type === 'HEADER');
  return h ? (h.format || 'TEXT') : null;
}

function footerVarMi(components) {
  if (!Array.isArray(components)) return false;
  return components.some(c => c.type === 'FOOTER');
}

function footerMetni(components) {
  if (!Array.isArray(components)) return '';
  const f = components.find(c => c.type === 'FOOTER');
  return f ? (f.text || '') : '';
}

module.exports = {
  listele, bul, olustur, guncelle, sil,
  bodyVariableSayisi, headerVarMi, headerFormat, footerVarMi, footerMetni,
};
