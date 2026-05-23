# Bağış Durum Görüntüleme Sistemi

Excel ile bağış kayıtlarını içeri alan, telefon numarasına göre bağışçı eşleştiren, her bağışçıya 8 karakterli benzersiz kod üreten ve WordPress üzerinden sorgu yapılmasını sağlayan sistem.

## Özellikler

- **Excel toplu yükleme** — Aynı ID tekrar yüklenince güncelleme yapar
- **Telefon bazlı bağışçı eşleştirme** — `2. Referans No` üzerinden referans bağışçı atama
- **8 karakterli tekil uniq kod** — bağışçı başına otomatik üretilir
- **Admin paneli** — Bağış, bağışçı listeleri, arama ve filtreleme
- **Toplu SMS gönderimi** — Netgsm entegrasyonu, mesaj şablonu (`{BAGISCI_ADI_SOYADI}`, `{UNIQ_KOD}`)
- **WordPress widget** — URL parametresi (`?kod=AB12CD34`) ile otomatik sorgulama
- **Secret key korumalı public API** — Uniq kod ile bağış durumu sorgulama

---

## Yerel Çalıştırma (Docker Compose)

```bash
cp .env.example .env
# .env içindeki SECRET_KEY, ADMIN_PASSWORD, SESSION_SECRET değerlerini düzenle
docker compose up --build -d
```

- **Admin paneli:** http://localhost:3000/admin (varsayılan: `admin` / `admin123`)
- **Sağlık kontrolü:** http://localhost:3000/health
- **Public API:** http://localhost:3000/api/sorgula

---

## Coolify'da Deploy

### Yöntem 1 — docker-compose.yml ile (önerilen)

1. **Yeni Resource → Docker Compose Empty** seç
2. Bu repoyu Git üzerinden bağla (`docker-compose.yml` otomatik okunur)
3. Coolify'ın **Environment Variables** sekmesinden şu değerleri tanımla:

   ```
   SECRET_KEY=<güçlü-rastgele-32+ karakter>
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=<güçlü-şifre>
   SESSION_SECRET=<güçlü-rastgele-string>
   CORS_ORIGIN=https://wordpress-siteniz.com
   POSTGRES_USER=bagis
   POSTGRES_PASSWORD=<güçlü-db-şifre>
   POSTGRES_DB=bagis_db
   DEFAULT_COUNTRY_CODE=90
   NODE_ENV=production
   TRUST_PROXY=1
   ```

4. Coolify üzerinden **app** servisinin domain'ini ayarla, SSL otomatik gelir
5. Deploy → bittiğinde `https://domain.com/health` yeşil dönerse hazır

### Yöntem 2 — Dockerfile + ayrı PostgreSQL servisi

1. **Yeni Resource → Application (Dockerfile)** seç, repoyu bağla
2. Ayrı bir **PostgreSQL servisi** ekle Coolify üzerinden
3. App servisinin env vars'ına PostgreSQL bağlantı bilgilerini gir (`DATABASE_URL`)

---

## Önemli Notlar

### Session Storage
Sessions PostgreSQL'de saklanır (`session` tablosu otomatik oluşturulur). Restart sonrası oturumlar korunur.

### Reverse Proxy
Coolify Traefik kullanır → `TRUST_PROXY=1` env'i şart, aksi halde session cookie'leri çalışmaz.

### CORS
WordPress sayfası farklı bir domain'deyse `CORS_ORIGIN` env'ine WordPress domain'ini yaz (virgülle ayırarak birden fazla domain de tanımlayabilirsin).

### İlk Yapılandırma
1. Admin paneline gir, sidebar'daki **⚙️ ayarlar** ikonuna tıkla
2. Netgsm bilgilerini gir (SMS göndermek için)
3. **WordPress Widget** menüsünden API URL ve Secret Key'i girip widget HTML'ini indir/kopyala
4. WordPress'te **Özel HTML** bloğu olarak yapıştır

---

## Ortam Değişkenleri

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `PORT` | hayır | Varsayılan 3000 |
| `DATABASE_URL` | evet | PostgreSQL bağlantı string'i |
| `SECRET_KEY` | evet | Public sorgulama API'si için key |
| `ADMIN_USERNAME` | evet | Admin paneli kullanıcı adı |
| `ADMIN_PASSWORD` | evet | Admin paneli şifresi |
| `SESSION_SECRET` | evet | Session imzalama için |
| `CORS_ORIGIN` | hayır | WordPress domain (virgülle ayır) |
| `DEFAULT_COUNTRY_CODE` | hayır | Varsayılan 90 (TR) |
| `NODE_ENV` | hayır | `production` ise güvenli cookie |
| `TRUST_PROXY` | hayır | Reverse proxy arkasında 1 |

---

## API Endpoints

### Public (secret key korumalı)
```http
POST /api/sorgula
Headers: x-secret-key: <SECRET_KEY>
Body: { "uniq_kod": "AB12CD34" }
```

### Admin (session korumalı)
```
POST /admin/api/giris       # Giriş
POST /admin/api/yukle       # Excel yükle
GET  /admin/api/bagiscilar  # Bağışçı listesi
GET  /admin/api/bagislar    # Bağış listesi
POST /admin/api/sms/gonder  # Toplu SMS
GET  /admin/api/widget/indir?api_url=...&secret_key=...
```

---

## Veri Modeli

**bagiscilar** — id, ad_soyad, telefon, ulke_kodu_var_mi, uniq_kod, created_at, updated_at
**bagislar** — id, excel_id (UNIQUE), ad_soyad, cep_telefonu, kimin_adina, ikinci_ref, ikinci_ref_cep_no, durum (`bekliyor`/`kesildi`), bagisci_id, referans_id
**ayarlar** — Netgsm konfigürasyonu (key-value)
**session** — PostgreSQL session store (otomatik oluşur)
