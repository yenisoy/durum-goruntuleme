const DEFAULT_COUNTRY_CODE = process.env.DEFAULT_COUNTRY_CODE || '90';

function normalizeTelefon(ham) {
  if (!ham) return { telefon: null, ulke_kodu_var_mi: false };

  let tel = String(ham).replace(/[\s\-().+]/g, '');

  // Sadece rakam bırak
  tel = tel.replace(/\D/g, '');

  if (!tel) return { telefon: null, ulke_kodu_var_mi: false };

  // Ülke kodu kontrolü: 90 ile başlıyor ve 12 haneli
  if (tel.startsWith('90') && tel.length === 12) {
    return { telefon: tel, ulke_kodu_var_mi: true };
  }

  // 0 ile başlıyorsa yerel format (0XXXXXXXXXX = 11 hane)
  if (tel.startsWith('0') && tel.length === 11) {
    return { telefon: DEFAULT_COUNTRY_CODE + tel.slice(1), ulke_kodu_var_mi: false };
  }

  // 5 ile başlıyor, 10 hane — Türk cep numarası, ülke kodu eksik
  if (tel.startsWith('5') && tel.length === 10) {
    return { telefon: DEFAULT_COUNTRY_CODE + tel, ulke_kodu_var_mi: false };
  }

  // Diğer durumlar: ülke kodu olduğu varsayılamaz
  if (tel.length >= 10) {
    return { telefon: tel, ulke_kodu_var_mi: false };
  }

  return { telefon: tel, ulke_kodu_var_mi: false };
}

module.exports = { normalizeTelefon };
