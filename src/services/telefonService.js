const DEFAULT_COUNTRY_CODE = process.env.DEFAULT_COUNTRY_CODE || '90';

// WhatsApp gönderiminde varsayılan kabul edilen ülke kodları
const WHATSAPP_KNOWN_CC = ['31', '32', '33', '34', '41', '49', '90'];

// Diğer ülke kodları (numara tespiti için) — önce uzun olanlar
const TUM_CC = [
  '380', '381', '382', '385', '386', '387', '389',
  '350', '351', '352', '353', '354', '355', '356', '357', '358', '359',
  '370', '371', '372', '373', '374', '375', '376', '377', '378',
  '420', '421', '423', '500', '501', '502', '503', '504', '505', '506', '507', '508', '509',
  '590', '591', '592', '593', '594', '595', '596', '597', '598', '599',
  '880', '886', '960', '961', '962', '963', '964', '965', '966', '967', '968',
  '970', '971', '972', '973', '974', '975', '976', '977', '992', '993', '994', '995', '996', '998',
  '90', '49', '43', '33', '32', '31', '34', '39', '41', '44', '45', '46', '47', '48',
  '20', '27', '30', '36', '40', '51', '52', '53', '54', '55', '56', '57', '58',
  '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86',
  '91', '92', '93', '94', '95', '98', '1', '7',
];
const SORTED_CC = [...new Set(TUM_CC)].sort((a, b) => b.length - a.length);

function normalizeTelefon(ham) {
  if (!ham) return { telefon: null, ulke_kodu_var_mi: false, ulke_kodu: null };

  let tel = String(ham).replace(/\D/g, '');
  if (!tel) return { telefon: null, ulke_kodu_var_mi: false, ulke_kodu: null };

  // Türkiye yerel formatlar
  if (tel.startsWith('0') && tel.length === 11) {
    const cc = DEFAULT_COUNTRY_CODE;
    return { telefon: cc + tel.slice(1), ulke_kodu_var_mi: true, ulke_kodu: cc };
  }
  if (tel.startsWith('5') && tel.length === 10) {
    const cc = DEFAULT_COUNTRY_CODE;
    return { telefon: cc + tel, ulke_kodu_var_mi: true, ulke_kodu: cc };
  }

  // Toplam uzunluk makul aralıkta mı?
  if (tel.length >= 10 && tel.length <= 15) {
    for (const cc of SORTED_CC) {
      if (tel.startsWith(cc)) {
        const yerel = tel.length - cc.length;
        // Yerel kısım en az 7, en fazla 12 hane olmalı
        if (yerel >= 7 && yerel <= 12) {
          return { telefon: tel, ulke_kodu_var_mi: true, ulke_kodu: cc };
        }
      }
    }
  }

  // Ülke kodu tespit edilemedi
  return { telefon: tel || null, ulke_kodu_var_mi: false, ulke_kodu: null };
}

function whatsappBilinenMi(ulkeKodu) {
  return ulkeKodu && WHATSAPP_KNOWN_CC.includes(String(ulkeKodu));
}

module.exports = {
  normalizeTelefon,
  whatsappBilinenMi,
  WHATSAPP_KNOWN_CC,
  DEFAULT_COUNTRY_CODE,
};
