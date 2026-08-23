export type Locale = { currency: string; tz: string; locale: string };

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);

const CURRENCIES = new Set([
  "AED", "AUD", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP",
  "HKD", "HUF", "ILS", "INR", "JPY", "KRW", "MXN", "NOK", "NZD", "PLN",
  "RON", "SEK", "SGD", "TRY", "TWD", "USD", "ZAR",
]);

export function minorFactor(currency: string): number {
  return ZERO_DECIMAL.has(currency) ? 1 : 100;
}

export function validCurrency(code: string): boolean {
  return CURRENCIES.has(code);
}

export function validTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function localeForCurrency(currency: string): string {
  return (
    {
      GBP: "en-GB",
      USD: "en-US",
      AUD: "en-AU",
      CAD: "en-CA",
      NZD: "en-NZ",
      EUR: "en-IE",
      JPY: "ja-JP",
      KRW: "ko-KR",
      INR: "en-IN",
      SGD: "en-SG",
      HKD: "en-HK",
      CHF: "de-CH",
      SEK: "sv-SE",
      NOK: "nb-NO",
      DKK: "da-DK",
      PLN: "pl-PL",
      BRL: "pt-BR",
      MXN: "es-MX",
      ZAR: "en-ZA",
      CNY: "zh-CN",
      TWD: "zh-TW",
      AED: "ar-AE",
      ILS: "he-IL",
      TRY: "tr-TR",
    }[currency] || "en"
  );
}

function L(currency: string, tz: string, locale: string): Locale {
  return { currency, tz, locale };
}

const PLACES: Record<string, Locale> = {
  uk: L("GBP", "Europe/London", "en-GB"),
  gb: L("GBP", "Europe/London", "en-GB"),
  britain: L("GBP", "Europe/London", "en-GB"),
  "united kingdom": L("GBP", "Europe/London", "en-GB"),
  england: L("GBP", "Europe/London", "en-GB"),
  scotland: L("GBP", "Europe/London", "en-GB"),
  wales: L("GBP", "Europe/London", "en-GB"),
  london: L("GBP", "Europe/London", "en-GB"),
  ireland: L("EUR", "Europe/Dublin", "en-IE"),
  ie: L("EUR", "Europe/Dublin", "en-IE"),
  dublin: L("EUR", "Europe/Dublin", "en-IE"),
  us: L("USD", "America/New_York", "en-US"),
  usa: L("USD", "America/New_York", "en-US"),
  "united states": L("USD", "America/New_York", "en-US"),
  "new york": L("USD", "America/New_York", "en-US"),
  nyc: L("USD", "America/New_York", "en-US"),
  chicago: L("USD", "America/Chicago", "en-US"),
  denver: L("USD", "America/Denver", "en-US"),
  "los angeles": L("USD", "America/Los_Angeles", "en-US"),
  la: L("USD", "America/Los_Angeles", "en-US"),
  sf: L("USD", "America/Los_Angeles", "en-US"),
  seattle: L("USD", "America/Los_Angeles", "en-US"),
  canada: L("CAD", "America/Toronto", "en-CA"),
  toronto: L("CAD", "America/Toronto", "en-CA"),
  vancouver: L("CAD", "America/Vancouver", "en-CA"),
  australia: L("AUD", "Australia/Sydney", "en-AU"),
  sydney: L("AUD", "Australia/Sydney", "en-AU"),
  melbourne: L("AUD", "Australia/Melbourne", "en-AU"),
  nz: L("NZD", "Pacific/Auckland", "en-NZ"),
  "new zealand": L("NZD", "Pacific/Auckland", "en-NZ"),
  auckland: L("NZD", "Pacific/Auckland", "en-NZ"),
  germany: L("EUR", "Europe/Berlin", "de-DE"),
  de: L("EUR", "Europe/Berlin", "de-DE"),
  berlin: L("EUR", "Europe/Berlin", "de-DE"),
  france: L("EUR", "Europe/Paris", "fr-FR"),
  paris: L("EUR", "Europe/Paris", "fr-FR"),
  spain: L("EUR", "Europe/Madrid", "es-ES"),
  madrid: L("EUR", "Europe/Madrid", "es-ES"),
  italy: L("EUR", "Europe/Rome", "it-IT"),
  rome: L("EUR", "Europe/Rome", "it-IT"),
  netherlands: L("EUR", "Europe/Amsterdam", "nl-NL"),
  amsterdam: L("EUR", "Europe/Amsterdam", "nl-NL"),
  sweden: L("SEK", "Europe/Stockholm", "sv-SE"),
  norway: L("NOK", "Europe/Oslo", "nb-NO"),
  denmark: L("DKK", "Europe/Copenhagen", "da-DK"),
  switzerland: L("CHF", "Europe/Zurich", "de-CH"),
  zurich: L("CHF", "Europe/Zurich", "de-CH"),
  poland: L("PLN", "Europe/Warsaw", "pl-PL"),
  portugal: L("EUR", "Europe/Lisbon", "pt-PT"),
  lisbon: L("EUR", "Europe/Lisbon", "pt-PT"),
  austria: L("EUR", "Europe/Vienna", "de-AT"),
  belgium: L("EUR", "Europe/Brussels", "nl-BE"),
  finland: L("EUR", "Europe/Helsinki", "fi-FI"),
  greece: L("EUR", "Europe/Athens", "el-GR"),
  japan: L("JPY", "Asia/Tokyo", "ja-JP"),
  tokyo: L("JPY", "Asia/Tokyo", "ja-JP"),
  korea: L("KRW", "Asia/Seoul", "ko-KR"),
  seoul: L("KRW", "Asia/Seoul", "ko-KR"),
  india: L("INR", "Asia/Kolkata", "en-IN"),
  singapore: L("SGD", "Asia/Singapore", "en-SG"),
  hk: L("HKD", "Asia/Hong_Kong", "en-HK"),
  "hong kong": L("HKD", "Asia/Hong_Kong", "en-HK"),
  uae: L("AED", "Asia/Dubai", "ar-AE"),
  dubai: L("AED", "Asia/Dubai", "ar-AE"),
  brazil: L("BRL", "America/Sao_Paulo", "pt-BR"),
  mexico: L("MXN", "America/Mexico_City", "es-MX"),
  "south africa": L("ZAR", "Africa/Johannesburg", "en-ZA"),
  china: L("CNY", "Asia/Shanghai", "zh-CN"),
  taiwan: L("TWD", "Asia/Taipei", "zh-TW"),
  turkey: L("TRY", "Europe/Istanbul", "tr-TR"),
  israel: L("ILS", "Asia/Jerusalem", "he-IL"),
};

const CURRENCY_ONLY: Record<string, Locale> = {
  GBP: PLACES.uk,
  JPY: PLACES.japan,
  AUD: PLACES.australia,
  NZD: PLACES.nz,
  CAD: PLACES.canada,
  CHF: PLACES.switzerland,
  INR: PLACES.india,
  SGD: PLACES.singapore,
  HKD: PLACES["hong kong"],
  BRL: PLACES.brazil,
  MXN: PLACES.mexico,
  ZAR: PLACES["south africa"],
  SEK: PLACES.sweden,
  NOK: PLACES.norway,
  DKK: PLACES.denmark,
  PLN: PLACES.poland,
  CNY: PLACES.china,
  KRW: PLACES.korea,
  TRY: PLACES.turkey,
  AED: PLACES.uae,
  ILS: PLACES.israel,
  TWD: PLACES.taiwan,
};

const LANG: Record<string, Locale> = {
  "en-gb": PLACES.uk,
  "en-us": PLACES.us,
  "en-au": PLACES.australia,
  "en-ca": PLACES.canada,
  "en-nz": PLACES.nz,
  "en-ie": PLACES.ireland,
  "en-in": PLACES.india,
  "en-za": PLACES["south africa"],
  "en-sg": PLACES.singapore,
  de: PLACES.germany,
  "de-at": PLACES.austria,
  "de-ch": PLACES.switzerland,
  fr: PLACES.france,
  es: PLACES.spain,
  "es-mx": PLACES.mexico,
  it: PLACES.italy,
  nl: PLACES.netherlands,
  pt: PLACES.portugal,
  "pt-br": PLACES.brazil,
  ja: PLACES.japan,
  ko: PLACES.korea,
  sv: PLACES.sweden,
  nb: PLACES.norway,
  no: PLACES.norway,
  da: PLACES.denmark,
  pl: PLACES.poland,
  fi: PLACES.finland,
  el: PLACES.greece,
  zh: PLACES.china,
  "zh-tw": PLACES.taiwan,
  "zh-hk": PLACES["hong kong"],
  tr: PLACES.turkey,
  he: PLACES.israel,
  ar: PLACES.uae,
};

export function guessFromLang(code?: string): Locale | undefined {
  if (!code) return undefined;
  const c = code.toLowerCase();
  return LANG[c] ?? LANG[c.split("-")[0]];
}

export function cityOf(tz: string): string {
  return tz.split("/").at(-1)?.replaceAll("_", " ") ?? tz;
}

function hasKey(text: string, key: string): boolean {
  return ` ${text} `.includes(` ${key} `);
}

function tzFromCity(city: string): string | undefined {
  const needle = city.replaceAll(" ", "_").toLowerCase();
  if (!needle) return undefined;
  const zones = Intl.supportedValuesOf("timeZone");
  return (
    zones.find((z) => z.toLowerCase().endsWith(`/${needle}`)) ??
    zones.find((z) => z.toLowerCase().includes(`/${needle}`))
  );
}

export function parsePlace(raw: string): Locale | undefined {
  const text = raw
    .toLowerCase()
    .replaceAll(/['’]/g, "")
    .replaceAll(/[^a-z0-9/+\s-]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  if (!text) return undefined;

  let currency: string | undefined;
  for (const token of text.split(" ")) {
    const code = token.toUpperCase();
    if (validCurrency(code)) currency = code;
  }

  const iana = text.match(/[a-z]+\/[a-z_]+(?:\/[a-z_]+)?/);
  const tz = iana && validTz(capitalizeTz(iana[0])) ? capitalizeTz(iana[0]) : undefined;

  const keys = Object.keys(PLACES).sort((a, b) => b.length - a.length);
  let place: Locale | undefined;
  for (const key of keys) {
    if (hasKey(text, key)) {
      place = PLACES[key];
      break;
    }
  }

  if (!place) {
    for (const token of text.split(" ")) {
      if (token.length < 3 || token === currency?.toLowerCase()) continue;
      const found = tzFromCity(token);
      if (found && currency) {
        place = { currency, tz: found, locale: localeForCurrency(currency) };
        break;
      }
    }
  }

  if (place && currency) return { ...place, currency, locale: localeForCurrency(currency) };
  if (place) return place;
  if (currency && tz) return { currency, tz, locale: localeForCurrency(currency) };
  if (currency && CURRENCY_ONLY[currency]) return CURRENCY_ONLY[currency];
  return undefined;
}

function capitalizeTz(tz: string): string {
  return tz
    .split("/")
    .map((part) => part.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("_"))
    .join("/");
}

export function isYes(text: string): boolean {
  return /^(y|yes|yeah|yep|yea|ok|okay|correct|right|thats right|that is right|looks good)$/i.test(
    text.trim().replaceAll(/['’]/g, ""),
  );
}

const PROCESSOR = new Set([
  "sq",
  "tst",
  "paypal",
  "pp",
  "stripe",
  "sumup",
  "square",
  "pos",
  "dbi",
  "www",
  "http",
  "https",
  "com",
  "net",
  "co",
  "uk",
  "gb",
  "io",
]);

const STOP = new Set(["the", "and", "for", "from", "with", "ltd", "llc", "inc", "limited"]);

export function searchText(...parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .toLowerCase()
    .replace(/https?:\/\//g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchTokens(query: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of searchText(query).split(" ")) {
    if (token.length < 2 || STOP.has(token) || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (tokens.length === 4) break;
  }
  return tokens;
}

export function merchantKey(merchant: string): string {
  const tokens = searchText(merchant).split(" ").filter(Boolean);
  const core = tokens.filter((token) => !PROCESSOR.has(token));
  return (core.length ? core : tokens).join(" ") || merchant.toLowerCase().trim();
}

function isUglyMerchant(merchant: string): boolean {
  if (merchant.includes("*")) return true;
  const first = searchText(merchant).split(" ")[0];
  return Boolean(first && PROCESSOR.has(first));
}

export function preferMerchant(a: string, b: string): string {
  const au = isUglyMerchant(a) ? 1 : 0;
  const bu = isUglyMerchant(b) ? 1 : 0;
  if (au !== bu) return au < bu ? a : b;
  if (a.length !== b.length) return a.length < b.length ? a : b;
  return a < b ? a : b;
}

export function displayMerchant(merchant: string, key = merchantKey(merchant)): string {
  const raw = merchant.trim();
  if (raw && !isUglyMerchant(raw)) return raw;
  if (!key) return raw;
  return key
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function likeToken(token: string): string {
  return `%${token.replaceAll(/[%_]/g, "")}%`;
}

const ALIAS: Record<string, string> = {
  income: "income_monthly",
  salary: "income_monthly",
  take_home: "income_monthly",
  takehome: "income_monthly",
  pay: "income_monthly",
  save: "save_monthly",
  savings: "save_monthly",
  saving: "save_monthly",
  life: "life_monthly",
  life_cost: "life_monthly",
  life_costs: "life_monthly",
  essential_spend: "life_monthly",
  work_days: "life_days_per_week",
  workdays: "life_days_per_week",
  save_intent: "save_intent",
  invest_intent: "invest_intent",
  saving_for: "save_goal",
  save_for: "save_goal",
};

export function normalizeNoteKey(key: string): string {
  const slug = key
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  return ALIAS[slug] || slug;
}

export function parseNoteMajor(value: string): number | undefined {
  const s = value
    .trim()
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/~/g, "")
    .replace(/\babout\b/g, "")
    .replace(/\s+/g, " ");
  const grand = s.match(/(\d+(?:\.\d+)?)\s*(k|grand)\b/);
  if (grand) return Number(grand[1]) * 1000;
  const m = s.match(/(?:[£$€])\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  const n = Number(m[1] ?? m[2]);
  return Number.isFinite(n) ? n : undefined;
}

export function normalizeIntent(value: string): "yes" | "no" | string {
  const s = value.trim().toLowerCase();
  if (/^(no|none|nothing|nah|nope|n)$/.test(s)) return "no";
  if (/not (saving|investing)|don'?t want|no thanks/.test(s)) return "no";
  if (/^(yes|yeah|yep|y)$/.test(s)) return "yes";
  return value.trim();
}

export function lifeMonthlyMajor(notes: Record<string, string>): number | undefined {
  const monthly = notes.life_monthly ? parseNoteMajor(notes.life_monthly) : undefined;
  if (monthly != null) return monthly;
  const daily = notes.life_daily ? parseNoteMajor(notes.life_daily) : undefined;
  if (daily == null) return undefined;
  const days = parseNoteMajor(notes.life_days_per_week ?? notes.work_days ?? "");
  if (days != null && days > 0) return (daily * days * 52) / 12;
  return daily * 30;
}

export type LifeSpend = {
  merchant_key: string;
  merchant: string;
  category: string | null;
  currency: string;
  amount_pence: number;
  spent_on: string;
};

export type LifeGuess = {
  monthly_pence: number;
  daily_pence: number;
  food_daily_pence: number;
  travel_daily_pence: number;
  food_monthly_pence: number;
  travel_monthly_pence: number;
  days_per_week: number;
  confidence: "high" | "medium" | "low";
};

export type SpendBucket = "food" | "travel" | "subscriptions";
export type BucketMark = SpendBucket | "other";

const FOOD_HINT =
  /\b(tesco|sainsbury|asda|aldi|lidl|waitrose|morrison|iceland|ocado|coop|co op|marks spencer|pret|starbucks|costa|mcdonald|maccies|kfc|subway|nando|deliveroo|just ?eat|ubereats|uber eats|greggs|domino|wetherspoon|spoons|itsu|wasabi|chipotle|five ?guys|burger ?king|papa john|leon|pizza|takeaway|bakery|restaurant|cafe|coffee|grocer|supermarket)\b/i;
const TRAVEL_HINT =
  /\b(tfl|oyster|trainline|uber|bolt|freenow|stagecoach|megabus|national ?express|easyjet|ryanair|jet2|gwr|avanti|lner|thameslink|southern|shell|esso|texaco|petrol|fuel|taxi|rail|train|tube|bus)\b/i;
const FOOD_CAT = /grocery|groceries|supermarket|eating|restaurant|food|drink/i;
const TRAVEL_CAT = /transport|travel|petrol|fuel|taxi|rail/i;

export function classifySpend(
  row: { merchant_key: string; merchant?: string; category?: string | null },
  skipKeys: Set<string> = new Set(),
  overrides: Map<string, BucketMark> = new Map(),
): SpendBucket | null {
  const key = row.merchant_key.trim();
  if (!key) return null;
  const mark = overrides.get(key);
  if (mark === "other") return null;
  if (mark) return mark;
  if (skipKeys.has(key)) return "subscriptions";
  const hay = `${key} ${row.merchant ?? ""}`.toLowerCase();
  if (FOOD_HINT.test(hay) || (row.category && FOOD_CAT.test(row.category))) {
    if (/\buber\b/.test(key) && !/eat/.test(hay)) return "travel";
    return "food";
  }
  if (TRAVEL_HINT.test(hay) || (row.category && TRAVEL_CAT.test(row.category))) return "travel";
  return null;
}

function weekday(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function isLifeSpend(
  row: LifeSpend,
  skipKeys: Set<string>,
  overrides: Map<string, BucketMark> = new Map(),
): boolean {
  const kind = classifySpend(row, skipKeys, overrides);
  return kind === "food" || kind === "travel";
}

function bucket(row: LifeSpend, overrides: Map<string, BucketMark> = new Map()): "food" | "travel" | "life" {
  const kind = classifySpend(row, new Set(), overrides);
  if (kind === "food" || kind === "travel") return kind;
  return "life";
}

export function inferLife(
  rows: LifeSpend[],
  today: string,
  currency: string,
  skipKeys: Iterable<string> = [],
  overrides: Map<string, BucketMark> = new Map(),
): LifeGuess {
  const skip = new Set(skipKeys);
  const from = addDays(today, -27);
  let picked = rows.filter(
    (row) =>
      row.currency === currency &&
      row.spent_on >= from &&
      row.spent_on <= today &&
      isLifeSpend(row, skip, overrides),
  );
  if (picked.length < 4) {
    const wider = addDays(today, -55);
    picked = rows.filter(
      (row) =>
        row.currency === currency &&
        row.spent_on >= wider &&
        row.spent_on <= today &&
        isLifeSpend(row, skip, overrides),
    );
  }
  if (!picked.length) {
    return {
      monthly_pence: 0,
      daily_pence: 0,
      food_daily_pence: 0,
      travel_daily_pence: 0,
      food_monthly_pence: 0,
      travel_monthly_pence: 0,
      days_per_week: 7,
      confidence: "low",
    };
  }

  const amounts = picked.map((row) => row.amount_pence);
  const mid = median(amounts);
  const typical = mid > 0 ? picked.filter((row) => row.amount_pence <= mid * 3) : picked;
  const start = typical.reduce((min, row) => (row.spent_on < min ? row.spent_on : min), typical[0]!.spent_on);
  const span = Math.max(1, daysBetween(start, today) + 1);
  const food = typical.filter((row) => bucket(row, overrides) === "food");
  const travel = typical.filter((row) => bucket(row, overrides) === "travel");
  const total = typical.reduce((sum, row) => sum + row.amount_pence, 0);
  const foodTotal = food.reduce((sum, row) => sum + row.amount_pence, 0);
  const travelTotal = travel.reduce((sum, row) => sum + row.amount_pence, 0);
  const weekdayTotal = typical
    .filter((row) => {
      const day = weekday(row.spent_on);
      return day >= 1 && day <= 5;
    })
    .reduce((sum, row) => sum + row.amount_pence, 0);
  const workPattern = total > 0 && weekdayTotal / total >= 0.65;
  const daysPerWeek = workPattern ? 5 : 7;
  const weekdayCount = Array.from({ length: span }, (_, i) => weekday(addDays(start, i))).filter(
    (day) => day >= 1 && day <= 5,
  ).length;
  const daily = workPattern && weekdayCount ? Math.round(weekdayTotal / weekdayCount) : Math.round(total / span);
  const foodDaily = Math.round(foodTotal / span);
  const travelDaily = Math.round(travelTotal / span);
  const monthly = Math.round((daily * daysPerWeek * 52) / 12);
  const confidence = typical.length >= 12 ? "high" : typical.length >= 4 ? "medium" : "low";
  return {
    monthly_pence: monthly,
    daily_pence: daily,
    food_daily_pence: foodDaily,
    travel_daily_pence: travelDaily,
    food_monthly_pence: Math.round((foodDaily * daysPerWeek * 52) / 12),
    travel_monthly_pence: Math.round((travelDaily * daysPerWeek * 52) / 12),
    days_per_week: daysPerWeek,
    confidence,
  };
}

export type SplitLine = {
  name: string;
  total: string;
  pct: number;
  key?: string;
};

export type SplitChart = {
  split: SplitLine[];
  chart: string;
  food: string | null;
  travel: string | null;
};

export type SplitSpend = {
  merchant_key: string;
  merchant: string;
  category: string | null;
  currency: string;
  amount_pence: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const JUNK_CAT =
  /^(purchase|purchases|debit|credit|other|uncategorised|uncategorized|unknown|general|bill[ _]?payment|direct[ _]?debit|transfer|p2p)$/i;

function isJunkCategory(category: string | undefined): boolean {
  return Boolean(category && JUNK_CAT.test(category.trim()));
}

export function ignoreSpendCategory(category: string | undefined): boolean {
  if (!category) return true;
  if (isJunkCategory(category)) return true;
  return /^(food|travel|subs|subscriptions|life|groceries|eating out)$/i.test(category.trim());
}

function shortRange(from: string, to: string): string {
  const [, fm, fd] = from.split("-").map(Number);
  const [, tm, td] = to.split("-").map(Number);
  const end = `${td} ${MONTHS[(tm ?? 1) - 1]}`;
  if (fm === tm) return `${fd}-${end}`;
  return `${fd} ${MONTHS[(fm ?? 1) - 1]}-${end}`;
}

function bar(pct: number, slots = 10): string {
  const filled = Math.max(0, Math.min(slots, Math.round((pct / 100) * slots)));
  return `${"■".repeat(filled)}${"□".repeat(slots - filled)}`;
}

function formatChart(title: string, rows: SplitLine[]): string {
  if (!rows.length) return title;
  const lines = rows.map((row) => `${row.name}  ${row.total}\n${bar(row.pct)}  ${row.pct}%`);
  return `${title}\n\n${lines.join("\n")}`;
}

export function buildSplit(
  rows: SplitSpend[],
  currency: string,
  subKeys: Iterable<string>,
  format: (pence: number, currency?: string) => string,
  from: string,
  to: string,
  expensesLabel: string,
  overrides: Map<string, BucketMark> = new Map(),
): SplitChart {
  const skip = new Set([...subKeys].map((key) => key.trim()).filter(Boolean));
  const buckets = new Map<SpendBucket, number>();
  const merchants = new Map<string, { key: string; name: string; amount: number }>();
  let food = 0;
  let travel = 0;
  let home = 0;

  for (const row of rows) {
    if (row.currency !== currency) continue;
    home += row.amount_pence;
    const bucket = classifySpend(row, skip, overrides);
    if (bucket === "food") {
      food += row.amount_pence;
      buckets.set("food", (buckets.get("food") ?? 0) + row.amount_pence);
      continue;
    }
    if (bucket === "travel") {
      travel += row.amount_pence;
      buckets.set("travel", (buckets.get("travel") ?? 0) + row.amount_pence);
      continue;
    }
    if (bucket === "subscriptions") {
      buckets.set("subscriptions", (buckets.get("subscriptions") ?? 0) + row.amount_pence);
      continue;
    }
    const key = row.merchant_key.trim() || row.merchant.toLowerCase();
    const cur = merchants.get(key);
    if (cur) cur.amount += row.amount_pence;
    else merchants.set(key, { key, name: displayMerchant(row.merchant, key), amount: row.amount_pence });
  }

  const labels: Record<SpendBucket, string> = {
    food: "Food",
    travel: "Travel",
    subscriptions: "Subscriptions",
  };
  const ranked = [...merchants.values()].sort((a, b) => b.amount - a.amount);
  const picked: Array<{ name: string; amount: number; key?: string }> = [];
  for (const bucket of ["food", "travel", "subscriptions"] as SpendBucket[]) {
    const amount = buckets.get(bucket);
    if (amount) picked.push({ name: labels[bucket], amount });
  }
  const maxNamed = Math.max(0, 8 - picked.length - 1);
  let other = 0;
  for (const [i, row] of ranked.entries()) {
    if (i < maxNamed && (row.amount / Math.max(home, 1) >= 0.04 || picked.length < 4)) {
      picked.push({ name: row.name, amount: row.amount, key: row.key });
    } else {
      other += row.amount;
    }
  }
  if (other > 0) picked.push({ name: "Other", amount: other });

  const split = picked.map((row) => ({
    name: row.name,
    total: format(row.amount),
    pct: home ? Math.round((row.amount / home) * 100) : 0,
    key: row.key,
  }));
  const title = `${shortRange(from, to)}  ${expensesLabel}`;
  return {
    split,
    chart: formatChart(title, split),
    food: food ? format(food) : null,
    travel: travel ? format(travel) : null,
  };
}

type Cadence = "weekly" | "fortnightly" | "monthly" | "yearly";

export type InCredit = {
  merchant_key: string;
  merchant: string;
  currency: string;
  amount_pence: number;
  received_on: string;
};

export type IncomeStream = {
  merchant_key: string;
  name: string;
  currency: string;
  amount_pence: number;
  monthly_pence: number;
  cadence: Cadence;
};

export type IncomeGuess = {
  typical_monthly_pence: number;
  confidence: "high" | "medium" | "low";
  streams: IncomeStream[];
};

const INCOME_SKIP = new Set(["stripe", "paypal", "pp", "sumup", "sq", "square", "unknown"]);
const MIN_STREAM = 5000;

function incomeCadenceOf(days: number): Cadence | undefined {
  if (days >= 5 && days <= 10) return "weekly";
  if (days >= 13 && days <= 17) return "fortnightly";
  if (days >= 25 && days <= 40) return "monthly";
  if (days >= 330 && days <= 400) return "yearly";
  return undefined;
}

function monthlyPence(amount: number, cadence: Cadence): number {
  if (cadence === "weekly") return Math.round((amount * 52) / 12);
  if (cadence === "fortnightly") return Math.round((amount * 26) / 12);
  if (cadence === "yearly") return Math.round(amount / 12);
  return amount;
}

function close(a: number, b: number, ratio = 0.15): boolean {
  const mid = Math.max(a, b);
  if (mid <= 0) return false;
  return Math.abs(a - b) / mid <= ratio;
}

function incomeStableAmounts(amounts: number[]): boolean {
  if (amounts.length < 2) return false;
  const mid = median(amounts);
  if (mid <= 0) return false;
  const closeN = amounts.filter((amount) => Math.abs(amount - mid) / mid <= 0.2).length;
  return closeN / amounts.length >= 0.7;
}

function inferStreams(credits: InCredit[], today: string): IncomeStream[] {
  const groups = new Map<string, InCredit[]>();
  for (const row of credits) {
    const key = row.merchant_key.trim();
    if (!key || INCOME_SKIP.has(key) || row.amount_pence < MIN_STREAM) continue;
    const id = `${key}\0${row.currency}`;
    const list = groups.get(id);
    if (list) list.push(row);
    else groups.set(id, [row]);
  }

  const found: IncomeStream[] = [];
  for (const rows of groups.values()) {
    const dated = [...rows].sort((a, b) => a.received_on.localeCompare(b.received_on));
    if (dated.length < 2) continue;
    const recent = dated.slice(-12);
    const gaps: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const gap = daysBetween(recent[i - 1]!.received_on, recent[i]!.received_on);
      if (gap > 0) gaps.push(gap);
    }
    if (!gaps.length) continue;
    const cadence = incomeCadenceOf(median(gaps));
    if (!cadence) continue;
    const amounts = recent.slice(-6).map((row) => row.amount_pence);
    if (recent.length === 2 && !close(amounts[0]!, amounts[1]!)) continue;
    if (recent.length >= 3 && !incomeStableAmounts(amounts)) continue;
    const last = recent[recent.length - 1]!;
    if (
      daysBetween(last.received_on, today) >
      (cadence === "weekly" ? 21 : cadence === "fortnightly" ? 28 : cadence === "yearly" ? 400 : 50)
    ) {
      continue;
    }
    const typical = Math.round(median(amounts));
    found.push({
      merchant_key: last.merchant_key,
      name: displayMerchant(last.merchant, last.merchant_key),
      currency: last.currency,
      amount_pence: typical,
      monthly_pence: monthlyPence(typical, cadence),
      cadence,
    });
  }
  return found;
}

export function inferIncome(credits: InCredit[], today: string, currency: string): IncomeGuess {
  const home = credits.filter((row) => row.currency === currency);
  const streams = inferStreams(home, today);
  const streamMonthly = streams.reduce((sum, row) => sum + row.monthly_pence, 0);
  const byMonth = new Map<string, number>();
  for (const row of home) {
    const month = row.received_on.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + row.amount_pence);
  }
  const thisMonthKey = today.slice(0, 7);
  const complete = [...byMonth.entries()]
    .filter(([month]) => month < thisMonthKey)
    .map(([, total]) => total);
  const thisMonth = byMonth.get(thisMonthKey) ?? 0;

  if (streamMonthly > 0) {
    const strong = streams.some((row) => row.cadence !== "yearly");
    return {
      typical_monthly_pence: streamMonthly,
      confidence: strong && home.length >= 3 ? "high" : "medium",
      streams,
    };
  }
  if (complete.length >= 2) {
    return {
      typical_monthly_pence: Math.round(median(complete)),
      confidence: complete.length >= 3 ? "high" : "medium",
      streams,
    };
  }
  if (complete.length === 1) {
    return { typical_monthly_pence: complete[0]!, confidence: "medium", streams };
  }
  if (thisMonth > 0) {
    return { typical_monthly_pence: thisMonth, confidence: "low", streams };
  }
  return { typical_monthly_pence: 0, confidence: "low", streams };
}

type PersistCadence = "weekly" | "monthly" | "yearly";
export type SubCadence = PersistCadence | "bimonthly" | "quarterly";
export type SubConfidence = "definite" | "likely" | "lapsed";

export type Charge = {
  merchant_key: string;
  merchant: string;
  currency: string;
  amount_pence: number;
  spent_on: string;
  category?: string | null;
};

export type InferredSub = {
  merchant_key: string;
  name: string;
  currency: string;
  amount_pence: number;
  cadence: PersistCadence;
  kind: "flat" | "usage";
  next_date: string;
  last_spent_on: string;
};

export type ScoredSub = {
  merchant_key: string;
  name: string;
  currency: string;
  amount_pence: number;
  cadence: SubCadence;
  kind: "flat" | "usage";
  confidence: SubConfidence;
  next_date: string;
  last_spent_on: string;
  n: number;
};

const SUB_SKIP = new Set(["stripe", "paypal", "pp", "sumup", "sq", "square", "pos", "dbi", "unknown"]);

const SHOP = new Set([
  "tesco",
  "sainsbury",
  "sainsburys",
  "asda",
  "aldi",
  "lidl",
  "waitrose",
  "morrisons",
  "iceland",
  "ocado",
  "pret",
  "starbucks",
  "costa",
  "mcdonalds",
  "kfc",
  "subway",
  "nandos",
  "deliveroo",
  "justeat",
  "ubereats",
  "uber",
  "tfl",
  "trainline",
]);

const USAGE = new Set([
  "supabase",
  "railway",
  "vercel",
  "aws",
  "openai",
  "chatgpt",
  "anthropic",
  "claude",
  "cursor",
  "digitalocean",
  "heroku",
  "netlify",
  "cloudflare",
  "render",
  "github",
  "gitlab",
  "twilio",
  "sendgrid",
  "sentry",
  "datadog",
  "planetscale",
  "neon",
  "upstash",
  "fly",
]);

const LIFE = /grocery|groceries|supermarket|shopping|eating|restaurant|food and drink|transport|travel|petrol|fuel|taxi/i;

function subCadenceOf(days: number): SubCadence | undefined {
  if (days >= 5 && days <= 10) return "weekly";
  if (days >= 25 && days <= 40) return "monthly";
  if (days >= 50 && days <= 80) return "bimonthly";
  if (days >= 81 && days <= 130) return "quarterly";
  if (days >= 330 && days <= 400) return "yearly";
  return undefined;
}

function cycleDays(cadence: SubCadence): number {
  if (cadence === "weekly") return 7;
  if (cadence === "bimonthly") return 60;
  if (cadence === "quarterly") return 90;
  if (cadence === "yearly") return 365;
  return 30;
}

export function nextAfter(last: string, cadence: SubCadence, today: string): string {
  const step = cycleDays(cadence);
  let next = addDays(last, step);
  while (next < today) next = addDays(next, step);
  return next;
}

function subStableAmounts(amounts: number[]): boolean {
  if (amounts.length < 2) return false;
  const mid = median(amounts);
  if (mid <= 0) return false;
  const close = amounts.filter((amount) => Math.abs(amount - mid) / mid <= 0.12).length;
  return close / amounts.length >= (amounts.length < 3 ? 1 : 0.75);
}

function lifeMerchant(key: string, rows: Charge[]): boolean {
  if (key.split(" ").some((token) => SHOP.has(token))) return true;
  const tagged = rows.filter((row) => row.category && LIFE.test(row.category)).length;
  return tagged >= rows.length / 2;
}

function usageName(key: string): boolean {
  return key.split(" ").some((token) => USAGE.has(token));
}

function nameOf(rows: Charge[]): string {
  const best = rows.reduce((cur, row) => (row.merchant.length <= cur.merchant.length ? row : cur), rows[0]!);
  return displayMerchant(best.merchant, best.merchant_key);
}

export function cadencePhrase(cadence: SubCadence): string {
  if (cadence === "weekly") return "/wk";
  if (cadence === "bimonthly") return " every couple of months";
  if (cadence === "quarterly") return "/qtr";
  if (cadence === "yearly") return "/yr";
  return "/mo";
}

export function scoreSubscriptions(charges: Charge[], today: string): ScoredSub[] {
  const groups = new Map<string, Charge[]>();
  for (const charge of charges) {
    const key = charge.merchant_key.trim();
    if (!key || SUB_SKIP.has(key)) continue;
    const id = `${key}\0${charge.currency}`;
    const list = groups.get(id);
    if (list) list.push(charge);
    else groups.set(id, [charge]);
  }

  const found: ScoredSub[] = [];
  for (const rows of groups.values()) {
    const dated = [...rows].sort((a, b) => a.spent_on.localeCompare(b.spent_on));
    const key = dated[0]!.merchant_key;
    if (lifeMerchant(key, dated)) continue;
    if (dated.length === 1 && usageName(key)) {
      const only = dated[0]!;
      const age = daysBetween(only.spent_on, today);
      if (age > 180) continue;
      found.push({
        merchant_key: only.merchant_key,
        name: nameOf(dated),
        currency: only.currency,
        amount_pence: only.amount_pence,
        cadence: "monthly",
        kind: "usage",
        confidence: "likely",
        next_date: nextAfter(only.spent_on, "monthly", today),
        last_spent_on: only.spent_on,
        n: 1,
      });
      continue;
    }
    if (dated.length < 2) continue;
    const recent = dated.slice(-12);
    const gaps: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const gap = daysBetween(recent[i - 1]!.spent_on, recent[i]!.spent_on);
      if (gap > 0) gaps.push(gap);
    }
    if (!gaps.length) continue;
    const medGap = median(gaps);
    const cadence = subCadenceOf(medGap);
    const known = usageName(key);
    const amounts = recent.slice(-6).map((row) => row.amount_pence);
    const flat = subStableAmounts(amounts);
    const usage = !flat && (known || cadence === "monthly" || cadence === "bimonthly" || cadence === "quarterly" || cadence === "yearly");
    if (cadence === "weekly" && !flat) continue;
    if (cadence) {
      const span = daysBetween(recent[0]!.spent_on, recent[recent.length - 1]!.spent_on);
      if (span > 0 && recent.length > span / cycleDays(cadence) + 1 + 2.2) continue;
    }
    const last = recent[recent.length - 1]!;
    const stale = cadence
      ? daysBetween(last.spent_on, today) > cycleDays(cadence) * 2.5
      : daysBetween(last.spent_on, today) > 180;
    const looksRepeat = Boolean(cadence) || known || (dated.length >= 3 && medGap >= 20 && medGap <= 130);
    if (!looksRepeat) continue;
    const step = cadence ?? (medGap >= 50 ? "bimonthly" : "monthly");
    const kind = flat ? "flat" : "usage";
    const row: ScoredSub = {
      merchant_key: last.merchant_key,
      name: nameOf(recent),
      currency: last.currency,
      amount_pence: Math.round(median(amounts)),
      cadence: cadence ?? step,
      kind,
      confidence: "likely",
      next_date: nextAfter(last.spent_on, cadence ?? step, today),
      last_spent_on: last.spent_on,
      n: dated.length,
    };
    if (stale) {
      row.confidence = "lapsed";
      found.push(row);
      continue;
    }
    if (dated.length >= 3 && cadence && (flat || usage)) row.confidence = "definite";
    else if (!flat && !usage && !known) continue;
    found.push(row);
  }
  return found;
}

function persistCadence(sub: ScoredSub): PersistCadence {
  if (sub.cadence === "weekly" || sub.cadence === "yearly") return sub.cadence;
  return "monthly";
}

function persistAmount(sub: ScoredSub): number {
  if (sub.cadence === "bimonthly") return Math.round(sub.amount_pence / 2);
  if (sub.cadence === "quarterly") return Math.round(sub.amount_pence / 3);
  return sub.amount_pence;
}

export function inferSubscriptions(charges: Charge[], today: string): InferredSub[] {
  return scoreSubscriptions(charges, today)
    .filter((row) => row.confidence === "definite")
    .map((row) => ({
      merchant_key: row.merchant_key,
      name: row.name,
      currency: row.currency,
      amount_pence: persistAmount(row),
      cadence: persistCadence(row),
      kind: row.kind,
      next_date: nextAfter(row.last_spent_on, persistCadence(row), today),
      last_spent_on: row.last_spent_on,
    }));
}
