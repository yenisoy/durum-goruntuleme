const express = require('express');
const multer = require('multer');
const router = express.Router();

const { giris, cikis, durumKontrol } = require('../controllers/adminController');
const { excelYukle } = require('../controllers/uploadController');
const { bagiscilarListele, bagislarListele } = require('../controllers/listController');
const { configGetir, configGuncelle, onizleme, smsSend } = require('../controllers/smsController');
const { sablonGetir, widgetIndir } = require('../controllers/widgetController');
const kCtrl = require('../controllers/kullaniciController');
const { girisKontrol, adminKontrol } = require('../middleware/adminAuth');

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const izinli = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (izinli.includes(file.mimetype) || file.originalname.match(/\.(xls|xlsx)$/i)) cb(null, true);
    else cb(new Error('Sadece .xls ve .xlsx dosyaları kabul edilir.'));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Public auth endpoints
router.post('/giris', giris);
router.get('/durum', durumKontrol);

// Protected
router.post('/cikis', girisKontrol, cikis);
router.post('/yukle', girisKontrol, upload.single('excel'), excelYukle);
router.get('/bagiscilar', girisKontrol, bagiscilarListele);
router.get('/bagislar', girisKontrol, bagislarListele);

router.get('/sms/config', girisKontrol, configGetir);
router.post('/sms/config', girisKontrol, configGuncelle);
router.post('/sms/onizleme', girisKontrol, onizleme);
router.post('/sms/gonder', girisKontrol, smsSend);

router.get('/widget/sablon', girisKontrol, sablonGetir);
router.get('/widget/indir', girisKontrol, widgetIndir);

// Profil (kendi)
router.get('/profil', girisKontrol, kCtrl.profilGetir);
router.post('/profil/sifre', girisKontrol, kCtrl.sifreDegistir);

// Kullanıcı yönetimi (sadece admin)
router.get('/kullanicilar', adminKontrol, kCtrl.listele);
router.post('/kullanicilar', adminKontrol, kCtrl.olustur);
router.delete('/kullanicilar/:id', adminKontrol, kCtrl.sil);
router.post('/kullanicilar/:id/secret-key', adminKontrol, kCtrl.secretKeyYenile);

module.exports = router;
