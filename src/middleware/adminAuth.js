function adminAuthKontrol(req, res, next) {
  if (req.session && req.session.adminGiris) {
    return next();
  }
  return res.status(401).json({ basarili: false, mesaj: 'Oturum açmanız gerekiyor.' });
}

module.exports = { adminAuthKontrol };
