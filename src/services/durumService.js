const GECERLI_DURUMLAR = ['bekliyor', 'kesildi'];

function normalizeDurum(ham, varsayilan = 'bekliyor') {
  if (!ham) return varsayilan;

  const normalized = String(ham)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Türkçe karakter düzeltmeleri
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();

  // Ham değeri de küçük harfe çevir Türkçe karakterlerle
  const hamNorm = String(ham)
    .toLowerCase()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .trim();

  if (hamNorm === 'bekliyor') return 'bekliyor';
  if (hamNorm === 'kesildi') return 'kesildi';
  if (normalized === 'bekliyor') return 'bekliyor';
  if (normalized === 'kesildi') return 'kesildi';

  return null; // tanınmayan değer
}

module.exports = { normalizeDurum, GECERLI_DURUMLAR };
