function girisKontrol(req, res, next) {
  if (req.session && req.session.kullaniciId) return next();
  return res.status(401).json({ basarili: false, mesaj: 'Oturum açmanız gerekiyor.' });
}

function adminKontrol(req, res, next) {
  if (req.session && req.session.kullaniciId && req.session.rol === 'admin') return next();
  return res.status(403).json({ basarili: false, mesaj: 'Bu işlem için admin yetkisi gerekli.' });
}

// Geriye dönük uyumluluk
const adminAuthKontrol = girisKontrol;

module.exports = { girisKontrol, adminKontrol, adminAuthKontrol };
