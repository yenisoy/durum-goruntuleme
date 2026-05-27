const express = require('express');
const multer = require('multer');
const router = express.Router();

const { giris, cikis, durumKontrol } = require('../controllers/adminController');
const { excelYukle } = require('../controllers/uploadController');
const { bagiscilarListele, bagislarListele } = require('../controllers/listController');
const { configGetir, configGuncelle, onizleme, smsSend } = require('../controllers/smsController');
const { sablonGetir, widgetIndir } = require('../controllers/widgetController');
const kCtrl = require('../controllers/kullaniciController');
const waCtrl = require('../controllers/whatsappController');
const bgCtrl = require('../controllers/bagisciController');
const { girisKontrol, adminKontrol } = require('../middleware/adminAuth');

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const izinli = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
    ];
    if (izinli.includes(file.mimetype) || file.originalname.match(/\.(xls|xlsx|csv)$/i)) cb(null, true);
    else cb(new Error('Sadece .xls, .xlsx ve .csv dosyaları kabul edilir.'));
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
router.put('/bagiscilar/:id', girisKontrol, bgCtrl.bagisciGuncelle);
router.delete('/bagiscilar/:id', girisKontrol, bgCtrl.bagisciSil);
router.post('/bagiscilar/toplu-sil', girisKontrol, bgCtrl.bagisciTopluSil);
router.post('/bagiscilar/crm-import', girisKontrol, upload.single('excel'), bgCtrl.crmImportYukle);
router.get('/bagislar', girisKontrol, bagislarListele);
router.delete('/bagislar/:id', girisKontrol, bgCtrl.bagisSil);
router.post('/bagislar/toplu-sil', girisKontrol, bgCtrl.bagisTopluSil);

router.get('/sms/config', girisKontrol, configGetir);
router.post('/sms/config', girisKontrol, configGuncelle);
router.post('/sms/onizleme', girisKontrol, onizleme);
router.post('/sms/gonder', girisKontrol, smsSend);

router.get('/widget/sablon', girisKontrol, sablonGetir);
router.get('/widget/indir', girisKontrol, widgetIndir);

// Profil (kendi)
router.get('/profil', girisKontrol, kCtrl.profilGetir);
router.post('/profil/sifre', girisKontrol, kCtrl.sifreDegistir);


// WhatsApp (Monochat) — config, template, job
router.get('/whatsapp/config', girisKontrol, waCtrl.configGetir);
router.post('/whatsapp/config', girisKontrol, waCtrl.configGuncelle);

router.get('/whatsapp/templates', girisKontrol, waCtrl.templatesListele);
router.post('/whatsapp/templates', girisKontrol, waCtrl.templateOlustur);
router.put('/whatsapp/templates/:id', girisKontrol, waCtrl.templateGuncelle);
router.delete('/whatsapp/templates/:id', girisKontrol, waCtrl.templateSil);

router.get('/whatsapp/jobs', girisKontrol, waCtrl.jobListele);
router.get('/whatsapp/jobs/aktif', girisKontrol, waCtrl.jobAktif);
router.post('/whatsapp/jobs', girisKontrol, waCtrl.jobOlusturBaslat);
router.get('/whatsapp/jobs/:id', girisKontrol, waCtrl.jobDurum);
router.post('/whatsapp/jobs/:id/durdur', girisKontrol, waCtrl.jobDurdur);
router.post('/whatsapp/jobs/:id/devam', girisKontrol, waCtrl.jobDevam);
router.post('/whatsapp/jobs/:id/iptal', girisKontrol, waCtrl.jobIptal);

// Kullanıcı yönetimi (sadece admin)
router.get('/kullanicilar', adminKontrol, kCtrl.listele);
router.post('/kullanicilar', adminKontrol, kCtrl.olustur);
router.delete('/kullanicilar/:id', adminKontrol, kCtrl.sil);
router.post('/kullanicilar/:id/secret-key', adminKontrol, kCtrl.secretKeyYenile);

module.exports = router;
