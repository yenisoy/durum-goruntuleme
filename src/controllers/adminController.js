async function giris(req, res) {
  const { kullanici_adi, sifre } = req.body;

  if (!kullanici_adi || !sifre) {
    return res.status(400).json({ basarili: false, mesaj: 'Kullanıcı adı ve şifre gerekli.' });
  }

  const dogruKullanici = kullanici_adi === process.env.ADMIN_USERNAME;
  const dogruSifre = sifre === process.env.ADMIN_PASSWORD;

  if (!dogruKullanici || !dogruSifre) {
    return res.status(401).json({ basarili: false, mesaj: 'Kullanıcı adı veya şifre hatalı.' });
  }

  req.session.adminGiris = true;
  req.session.kullanici = kullanici_adi;

  return res.json({ basarili: true, mesaj: 'Giriş başarılı.' });
}

async function cikis(req, res) {
  req.session.destroy(() => {
    res.json({ basarili: true, mesaj: 'Çıkış yapıldı.' });
  });
}

async function durumKontrol(req, res) {
  res.json({ basarili: true, girisYapildi: !!(req.session && req.session.adminGiris) });
}

module.exports = { giris, cikis, durumKontrol };
