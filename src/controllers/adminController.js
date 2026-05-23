const k = require('../services/kullaniciService');

async function giris(req, res) {
  const { kullanici_adi, sifre } = req.body;

  if (!kullanici_adi || !sifre) {
    return res.status(400).json({ basarili: false, mesaj: 'Kullanıcı adı ve şifre gerekli.' });
  }

  const user = await k.dogrula(kullanici_adi, sifre);
  if (!user) {
    return res.status(401).json({ basarili: false, mesaj: 'Kullanıcı adı veya şifre hatalı.' });
  }

  req.session.kullaniciId = user.id;
  req.session.kullaniciAdi = user.kullanici_adi;
  req.session.rol = user.rol;

  return res.json({
    basarili: true,
    mesaj: 'Giriş başarılı.',
    kullanici: { kullanici_adi: user.kullanici_adi, rol: user.rol },
  });
}

async function cikis(req, res) {
  req.session.destroy(() => {
    res.json({ basarili: true, mesaj: 'Çıkış yapıldı.' });
  });
}

async function durumKontrol(req, res) {
  if (req.session && req.session.kullaniciId) {
    return res.json({
      basarili: true,
      girisYapildi: true,
      kullanici: { kullanici_adi: req.session.kullaniciAdi, rol: req.session.rol },
    });
  }
  res.json({ basarili: true, girisYapildi: false });
}

module.exports = { giris, cikis, durumKontrol };
