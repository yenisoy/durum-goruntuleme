function secretKeyKontrol(req, res, next) {
  const key = req.headers['x-secret-key'] || req.body?.secret_key || req.query.secret_key;

  if (!key || key !== process.env.SECRET_KEY) {
    return res.status(401).json({ basarili: false, mesaj: 'Geçersiz veya eksik secret key.' });
  }

  next();
}

module.exports = { secretKeyKontrol };
