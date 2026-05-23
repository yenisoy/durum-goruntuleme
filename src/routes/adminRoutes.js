const express = require('express');
const multer = require('multer');
const router = express.Router();

const { giris, cikis, durumKontrol } = require('../controllers/adminController');
const { excelYukle } = require('../controllers/uploadController');
const { bagiscilarListele, bagislarListele } = require('../controllers/listController');
const { configGetir, configGuncelle, onizleme, smsSend } = require('../controllers/smsController');
const { sablonGetir, widgetIndir } = require('../controllers/widgetController');
const { adminAuthKontrol } = require('../middleware/adminAuth');

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const izinli = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (izinli.includes(file.mimetype) || file.originalname.match(/\.(xls|xlsx)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Sadece .xls ve .xlsx dosyaları kabul edilir.'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

router.post('/giris', giris);
router.post('/cikis', adminAuthKontrol, cikis);
router.get('/durum', durumKontrol);
router.post('/yukle', adminAuthKontrol, upload.single('excel'), excelYukle);
router.get('/bagiscilar', adminAuthKontrol, bagiscilarListele);
router.get('/bagislar', adminAuthKontrol, bagislarListele);
router.get('/sms/config', adminAuthKontrol, configGetir);
router.post('/sms/config', adminAuthKontrol, configGuncelle);
router.post('/sms/onizleme', adminAuthKontrol, onizleme);
router.post('/sms/gonder', adminAuthKontrol, smsSend);
router.get('/widget/sablon', adminAuthKontrol, sablonGetir);
router.get('/widget/indir', adminAuthKontrol, widgetIndir);

module.exports = router;
