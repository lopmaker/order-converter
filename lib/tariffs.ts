const DEFAULT_ORIGIN_COUNTRY = 'CN';
const CHINA_SPECIAL_RATE = 0.075;

const COUNTRY_KEYWORDS: Array<{ country: string; keywords: string[] }> = [
  { country: 'CN', keywords: [' china', ' prc', 'shanghai', 'guangdong', 'fujian', 'zhejiang', 'shenzhen'] },
  { country: 'VN', keywords: [' vietnam', 'ho chi minh', 'hanoi'] },
  { country: 'BD', keywords: [' bangladesh', 'dhaka'] },
  { country: 'IN', keywords: [' india', 'mumbai', 'delhi'] },
  { country: 'PK', keywords: [' pakistan', 'karachi'] },
  { country: 'ID', keywords: [' indonesia', 'jakarta'] },
  { country: 'KH', keywords: [' cambodia', 'phnom penh'] },
];

type FabricBucket = 'cotton-rich' | 'poly-rich' | 'mixed';

function normalizeSpaces(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

function clampRate(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function getLifecycleGroup(description: string, collection: string): string {
  const combined = `${description} ${collection}`;
  if (/\bjunior\b|\bjr\b/.test(combined)) return 'junior';
  if (/\bkid\b|\byouth\b|\btoddler\b|\binfant\b|\bgirl\b|\bboy\b/.test(combined)) return 'kids';
  if (/\bmen\b|\bmens\b|\bmale\b/.test(combined)) return 'mens';
  if (/\bwomen\b|\bwomens\b|\blady\b|\bladies\b/.test(combined)) return 'womens';
  return 'general';
}

function getProductType(description: string): string {
  if (/\btee\b|t[\s-]?shirt|skimmer/.test(description)) return 'tee';
  if (/\bhoodie\b|sweatshirt|sweater|fleece/.test(description)) return 'top';
  if (/\btank\b/.test(description)) return 'tank';
  if (/\bdress\b/.test(description)) return 'dress';
  if (/\blegging\b/.test(description)) return 'leggings';
  if (/\bshort\b/.test(description)) return 'shorts';
  if (/\bpant\b|\btrouser\b/.test(description)) return 'pants';
  if (/\bjacket\b|outerwear|coat/.test(description)) return 'jacket';
  if (/\bhat\b|\bbag\b|\bsock\b|\bcap\b/.test(description)) return 'accessory';
  return 'apparel';
}

function parseCountryFromTariffKey(normalizedTariffKey: string): { country: string; baseKey: string } {
  const parts = normalizedTariffKey
    .split('|')
    .map((part) => normalizeSpaces(part.toLowerCase()))
    .filter(Boolean);

  if (parts.length >= 2 && /^[a-z]{2}$/.test(parts[0])) {
    return {
      country: parts[0].toUpperCase(),
      baseKey: normalizeTariffKey(parts.slice(1).join(' | ')),
    };
  }

  return { country: DEFAULT_ORIGIN_COUNTRY, baseKey: normalizedTariffKey };
}

function normalizeRateKey(rawKey: string): string {
  return normalizeTariffKey(rawKey).toLowerCase();
}

export function normalizeTariffKey(tariffKey: string): string {
  return normalizeSpaces(tariffKey.toLowerCase());
}

export function normalizeProductClass(productClass: string): string {
  return normalizeTariffKey(productClass);
}

export function inferOriginCountry(supplierName?: string | null, supplierAddress?: string | null): string {
  const haystack = ` ${supplierName || ''} ${supplierAddress || ''}`.toLowerCase();
  for (const item of COUNTRY_KEYWORDS) {
    if (item.keywords.some((keyword) => haystack.includes(keyword))) {
      return item.country;
    }
  }
  return DEFAULT_ORIGIN_COUNTRY;
}

export function detectFabricBucket(material?: string | null): FabricBucket {
  const text = (material || '').toLowerCase();
  if (!text.trim()) return 'mixed';

  const ratioMatches = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*%?\s*(cotton|polyester|poly)/g));
  let cottonRatio = 0;
  let polyRatio = 0;

  for (const match of ratioMatches) {
    const ratio = Number(match[1] || 0);
    const fabric = match[2] || '';
    if (fabric.includes('cotton')) cottonRatio += ratio;
    if (fabric.includes('poly')) polyRatio += ratio;
  }

  if (cottonRatio > 0 || polyRatio > 0) {
    if (cottonRatio >= polyRatio && cottonRatio >= 50) return 'cotton-rich';
    if (polyRatio > cottonRatio && polyRatio >= 50) return 'poly-rich';
    if (cottonRatio > polyRatio) return 'cotton-rich';
    if (polyRatio > cottonRatio) return 'poly-rich';
  }

  const hasCotton = /\bcotton\b|cotton-rich/.test(text);
  const hasPoly = /\bpoly\b|polyester|poly-rich/.test(text);

  if (hasCotton && !hasPoly) return 'cotton-rich';
  if (hasPoly && !hasCotton) return 'poly-rich';
  return 'mixed';
}

export function deriveTariffKey(input: {
  description?: string | null;
  collection?: string | null;
  material?: string | null;
}): string {
  const description = normalizeTariffKey(input.description || '');
  const collection = normalizeTariffKey(input.collection || '');
  const lifecycleGroup = getLifecycleGroup(description, collection);
  const productType = getProductType(description);
  const fabricBucket = detectFabricBucket(input.material);

  let category = productType;
  if (lifecycleGroup !== 'general') {
    category = `${lifecycleGroup} ${productType}`;
  }

  return normalizeTariffKey(`${category} | ${fabricBucket}`);
}

function getDefaultBaseRate(baseTariffKey: string): number {
  const [category = 'apparel', fabricBucket = 'mixed'] = baseTariffKey.split('|').map((s) => normalizeSpaces(s));

  if (category.includes('tee') || category.includes('tank')) {
    if (fabricBucket === 'cotton-rich') return 0.25;
    if (fabricBucket === 'poly-rich') return 0.22;
    return 0.24;
  }

  if (category.includes('top') || category.includes('hoodie') || category.includes('sweatshirt')) {
    if (fabricBucket === 'cotton-rich') return 0.26;
    if (fabricBucket === 'poly-rich') return 0.23;
    return 0.25;
  }

  if (category.includes('dress') || category.includes('jacket')) {
    if (fabricBucket === 'poly-rich') return 0.24;
    return 0.26;
  }

  if (category.includes('pants') || category.includes('shorts') || category.includes('leggings')) {
    if (fabricBucket === 'poly-rich') return 0.21;
    return 0.24;
  }

  if (category.includes('accessory')) {
    return 0.15;
  }

  if (fabricBucket === 'poly-rich') return 0.22;
  if (fabricBucket === 'cotton-rich') return 0.24;
  return 0.23;
}

export function applyOriginSpecialRate(baseRate: number, originCountry?: string | null): number {
  const country = (originCountry || DEFAULT_ORIGIN_COUNTRY).toUpperCase();
  if (country === 'CN') {
    return round4(clampRate(baseRate + CHINA_SPECIAL_RATE));
  }
  return round4(clampRate(baseRate));
}

export function defaultTariffRateByTariffKey(tariffKey: string, originCountry?: string | null): number {
  const normalized = normalizeTariffKey(tariffKey);
  const parsed = parseCountryFromTariffKey(normalized);
  const resolvedOrigin = (originCountry || parsed.country || DEFAULT_ORIGIN_COUNTRY).toUpperCase();
  const baseKey = parsed.baseKey || normalized;
  const baseRate = getDefaultBaseRate(baseKey);
  return applyOriginSpecialRate(baseRate, resolvedOrigin);
}

export function defaultTariffRateByProductClass(productClass: string): number {
  return defaultTariffRateByTariffKey(productClass, DEFAULT_ORIGIN_COUNTRY);
}

export function buildTariffLookupKeys(baseTariffKey: string, originCountry?: string | null): string[] {
  const normalizedBase = normalizeRateKey(baseTariffKey);
  const country = (originCountry || DEFAULT_ORIGIN_COUNTRY).toUpperCase();
  const keys = [`${country.toLowerCase()} | ${normalizedBase}`, normalizedBase];
  return Array.from(new Set(keys));
}

export function resolveTariffRate(params: {
  baseTariffKey: string;
  originCountry?: string | null;
  tariffMap: Map<string, number>;
}): { rate: number; matchedKey: string | null } {
  const normalizedBase = normalizeRateKey(params.baseTariffKey);
  const country = (params.originCountry || DEFAULT_ORIGIN_COUNTRY).toUpperCase();
  const countryKey = `${country.toLowerCase()} | ${normalizedBase}`;

  if (params.tariffMap.has(countryKey)) {
    return {
      rate: round4(clampRate(Number(params.tariffMap.get(countryKey) || 0))),
      matchedKey: countryKey,
    };
  }

  if (params.tariffMap.has(normalizedBase)) {
    return {
      rate: applyOriginSpecialRate(Number(params.tariffMap.get(normalizedBase) || 0), country),
      matchedKey: normalizedBase,
    };
  }

  return {
    rate: defaultTariffRateByTariffKey(normalizedBase, country),
    matchedKey: null,
  };
}
