const wa = require('../services/whatsappService');
const wat = require('../services/whatsappTemplateService');
const waj = require('../services/whatsappJobService');

// CONFIG
async function configGetir(req, res) {
  try {
    const cfg = await wa.configOku(req.session.kullaniciId);
    if (cfg && cfg.apiToken) cfg.apiToken = '••••••••';
    res.json({ basarili: true, config: cfg || {} });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function configGuncelle(req, res) {
  const { slug, apiToken, businessPhone, baseUrl } = req.body;
  if (!slug || !businessPhone) {
    return res.status(400).json({ basarili: false, mesaj: 'Slug ve business phone zorunludur.' });
  }
  try {
    const gercekToken = (!apiToken || apiToken === '••••••••') ? null : apiToken;
    await wa.configKaydet(req.session.kullaniciId, {
      slug, apiToken: gercekToken, businessPhone, baseUrl,
    });
    res.json({ basarili: true, mesaj: 'WhatsApp ayarları kaydedildi.' });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

// TEMPLATES
async function templatesListele(req, res) {
  try {
    res.json({ basarili: true, veri: await wat.listele(req.session.kullaniciId) });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function templatesSenkronize(req, res) {
  try {
    const config = await wa.configOku(req.session.kullaniciId);
    if (!config || !config.slug || !config.apiToken || !config.businessPhone) {
      return res.status(400).json({ basarili: false, mesaj: 'Önce Monochat ayarlarını tamamlayın.' });
    }

    const liste = await wa.templateleriCek(config);
    const sonuc = { toplam: liste.length, eklenen: 0, guncellenen: 0, atlanan: 0, hata: 0, detaylar: [] };

    for (const t of liste) {
      try {
        // Sadece onaylı (APPROVED) olanları al, REJECTED olanları atla
        if (t.status !== 'APPROVED') {
          sonuc.atlanan++;
          sonuc.detaylar.push({ ad: t.name, durum: 'atlandı', sebep: `Status: ${t.status}` });
          continue;
        }
        const components = wa.monochatComponentsToInternal(t.components);
        const mevcut = await wat.listele(req.session.kullaniciId).then(arr => arr.find(x => x.ad === t.name));
        if (mevcut) {
          await wat.guncelle(req.session.kullaniciId, mevcut.id, {
            ad: t.name,
            dil_kodu: t.languageCode,
            kategori: t.category || 'UTILITY',
            components,
          });
          sonuc.guncellenen++;
          sonuc.detaylar.push({ ad: t.name, durum: 'güncellendi' });
        } else {
          await wat.olustur(req.session.kullaniciId, {
            ad: t.name,
            dil_kodu: t.languageCode,
            kategori: t.category || 'UTILITY',
            components,
          });
          sonuc.eklenen++;
          sonuc.detaylar.push({ ad: t.name, durum: 'eklendi' });
        }
      } catch (e) {
        sonuc.hata++;
        sonuc.detaylar.push({ ad: t.name, durum: 'hata', sebep: e.message });
      }
    }

    res.json({ basarili: true, sonuc });
  } catch (err) {
    const detay = wa.hataDetayCikar(err);
    res.status(500).json({ basarili: false, mesaj: detay });
  }
}

async function templateOlustur(req, res) {
  try {
    const t = await wat.olustur(req.session.kullaniciId, req.body);
    res.json({ basarili: true, template: t });
  } catch (err) {
    res.status(400).json({ basarili: false, mesaj: err.message });
  }
}

async function templateGuncelle(req, res) {
  try {
    const t = await wat.guncelle(req.session.kullaniciId, parseInt(req.params.id), req.body);
    res.json({ basarili: true, template: t });
  } catch (err) {
    res.status(400).json({ basarili: false, mesaj: err.message });
  }
}

async function templateSil(req, res) {
  try {
    await wat.sil(req.session.kullaniciId, parseInt(req.params.id));
    res.json({ basarili: true });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

// JOBS
async function jobOlusturBaslat(req, res) {
  try {
    const job = await waj.jobOlustur(req.session.kullaniciId, req.body);
    const baslat = await waj.jobBaslat(req.session.kullaniciId, job.id);
    res.json({ basarili: true, job: baslat });
  } catch (err) {
    res.status(400).json({ basarili: false, mesaj: err.message });
  }
}

async function jobDurum(req, res) {
  try {
    const job = await waj.jobBul(req.session.kullaniciId, parseInt(req.params.id));
    if (!job) return res.status(404).json({ basarili: false, mesaj: 'Job bulunamadı.' });

    const sonItems = await waj.jobItemList(req.session.kullaniciId, job.id, { limit: 200 });
    res.json({ basarili: true, job, items: sonItems });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function jobAktif(req, res) {
  try {
    const job = await waj.aktifJobBul(req.session.kullaniciId);
    res.json({ basarili: true, job });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function jobListele(req, res) {
  try {
    res.json({ basarili: true, veri: await waj.jobList(req.session.kullaniciId) });
  } catch (err) {
    res.status(500).json({ basarili: false, mesaj: err.message });
  }
}

async function jobDurdur(req, res) {
  try {
    const job = await waj.jobDurdur(req.session.kullaniciId, parseInt(req.params.id));
    res.json({ basarili: true, job });
  } catch (err) {
    res.status(400).json({ basarili: false, mesaj: err.message });
  }
}

async function jobDevam(req, res) {
  try {
    const job = await waj.jobBaslat(req.session.kullaniciId, parseInt(req.params.id));
    res.json({ basarili: true, job });
  } catch (err) {
    res.status(400).json({ basarili: false, mesaj: err.message });
  }
}

async function jobIptal(req, res) {
  try {
    const job = await waj.jobIptal(req.session.kullaniciId, parseInt(req.params.id));
    res.json({ basarili: true, job });
  } catch (err) {
    res.status(400).json({ basarili: false, mesaj: err.message });
  }
}

module.exports = {
  configGetir, configGuncelle,
  templatesListele, templatesSenkronize, templateOlustur, templateGuncelle, templateSil,
  jobOlusturBaslat, jobDurum, jobAktif, jobListele, jobDurdur, jobDevam, jobIptal,
};
