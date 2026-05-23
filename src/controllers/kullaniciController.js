const k = require('../services/kullaniciService');

async function listele(req, res) {
  try {
    res.json({ basarili: true, veri: await k.listele() });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function olustur(req, res) {
  try {
    const { kullanici_adi, sifre, rol } = req.body;
    const yeni = await k.olustur({ kullanici_adi, sifre, rol });
    res.json({ basarili: true, kullanici: yeni });
  } catch (err) {
    res.status(400).json({ basarili: false, mesaj: err.message });
  }
}

async function sil(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (id === req.session.kullaniciId) {
      return res.status(400).json({ basarili: false, mesaj: 'Kendinizi silemezsiniz.' });
    }
    await k.sil(id);
    res.json({ basarili: true });
  } catch (err) {
    res.status(400).json({ basarili: false, mesaj: err.message });
  }
}

async function secretKeyYenile(req, res) {
  try {
    const id = parseInt(req.params.id);
    const yeni = await k.secretKeyYenile(id);
    res.json({ basarili: true, secret_key: yeni });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function sifreDegistir(req, res) {
  try {
    const { mevcut_sifre, yeni_sifre } = req.body;
    if (!mevcut_sifre || !yeni_sifre) {
      return res.status(400).json({ basarili: false, mesaj: 'Mevcut ve yeni şifre gerekli.' });
    }
    const user = await k.dogrula(req.session.kullaniciAdi, mevcut_sifre);
    if (!user) return res.status(401).json({ basarili: false, mesaj: 'Mevcut şifre hatalı.' });
    await k.sifreDegistir(req.session.kullaniciId, yeni_sifre);
    res.json({ basarili: true, mesaj: 'Şifre güncellendi.' });
  } catch (err) {
    res.status(400).json({ basarili: false, mesaj: err.message });
  }
}

async function profilGetir(req, res) {
  try {
    const user = await k.bulById(req.session.kullaniciId);
    if (!user) return res.status(404).json({ basarili: false, mesaj: 'Kullanıcı bulunamadı.' });
    res.json({
      basarili: true,
      profil: {
        id: user.id,
        kullanici_adi: user.kullanici_adi,
        secret_key: user.secret_key,
        rol: user.rol,
      },
    });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

module.exports = { listele, olustur, sil, secretKeyYenile, sifreDegistir, profilGetir };
