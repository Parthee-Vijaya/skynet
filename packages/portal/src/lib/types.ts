export interface ProcessInfo {
  name: string;
  cpu: number;
  mem: number;
  pid: number;
}

export interface DisplayInfo {
  name: string;
  resolution: string;       // logisk fx "3008×1692"
  native: string;           // native pixels fx "6016×3384"
  refreshRate: number;      // Hz
  isMain: boolean;
}

export interface MachineInfo {
  model: string;            // fx "Mac16,9"
  chip: string;             // fx "Apple M4 Max"
  ram: string;              // fx "64 GB"
  osVersion: string;        // fx "macOS 26.4.1"
}

export interface SystemData {
  cpu: { load: number; cores: number; brand: string };
  memory: {
    used: number;
    total: number;
    percent: number;
    wired?: number;       // bytes locked i memory (kernel)
    compressor?: number;  // bytes komprimeret af macOS' VM-compressor
    unused?: number;      // bytes virkeligt fri
    swapIns?: number;     // total swap-ins siden boot
    swapOuts?: number;    // total swap-outs siden boot
  };
  disk: { used: number; total: number; percent: number };
  temperature: number | null;
  network: { rxSec: number; txSec: number };
  battery: { hasBattery: boolean; percent: number | null; charging: boolean };
  host: { hostname: string; uptime: number; platform: string };
  power: { source: "ac" | "battery" | "unknown"; thermalWarning: boolean; watts: number | null };
  processes: { topCpu: ProcessInfo[]; topMem: ProcessInfo[]; total: number };
  loadAvg: [number, number, number];
  machine?: MachineInfo | null;
  displays?: DisplayInfo[];
}

export interface WeatherData {
  current: {
    temp: number;
    feelsLike: number;
    weatherCode: number;
    humidity: number;
    windSpeed: number;
  };
  hourly: Array<{ time: string; temp: number; weatherCode: number }>;
  location: string;
  /** Koordinater vejr-API'et blev kaldt med — så klienten kan sammenligne
   *  med browser-geolocation og vise "du er her" vs "vejr fra". */
  coords: { lat: number; lng: number };
  sun: {
    sunrise: string;
    sunset: string;
    dayLengthMinutes: number;
    isDaytime: boolean;
    progressPercent: number;
  };
}

export interface AirQualityData {
  aqi: number;
  pm25: number;
  pm10: number;
  no2: number;
  o3: number;
  rating: "good" | "moderate" | "unhealthy" | "very_unhealthy" | "hazardous";
  uvIndex: number | null;
  pollen: {
    birch: number | null;
    grass: number | null;
    alder: number | null;
    ragweed: number | null;
    mugwort: number | null;
    olive: number | null;
  };
}

export interface PlexStream {
  title: string;
  subtitle?: string;
  player: string;
  quality: string;
  progress: number;
  remainingMinutes: number;
  thumbColor?: string;
}

export interface PlexData {
  online: boolean;
  sessions: PlexStream[];
  library: { movies: number; shows: number; sizeBytes: number };
}

export interface SabnzbdSlot {
  id: string;
  name: string;
  category: string | null;
  status: string;
  percent: number;
  sizeMb: number;
  sizeLeftMb: number;
  timeLeft: string;
}

export interface SabnzbdData {
  online: boolean;
  configured: boolean;
  reason?: string;
  slots: SabnzbdSlot[];
  queueCount?: number;
  stats: {
    totalMb?: number;
    leftMb?: number;
    freeMb: number;
    kbpersec: number;
    paused: boolean;
    etaSeconds: number;
    timeLeftRaw?: string;
  };
  history: {
    totalGb: number;
    monthGb: number;
    weekGb: number;
    dayGb: number;
  };
}

export interface VpnData {
  connected: boolean;
  interface?: string;
  externalIp?: string;
  country?: string;
  countryCode?: string;
  uptimeSeconds?: number;
}

export interface DeviceItem {
  name: string;
  type: "usb" | "bluetooth" | "network";
  detail?: string;
}

export interface WifiInfo {
  ssid: string | null;
  rssi: number | null;
  channel: string | null;
  security: string | null;
  txRateMbps: number | null;
}

export interface DevicesData {
  usb: DeviceItem[];
  bluetooth: DeviceItem[];
  network: DeviceItem[];
  wifi?: WifiInfo;
}

export interface HistoryPoint {
  ts: number;
  value: number;
}

export interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  category?: string;
}

export interface FeedBundle {
  items: FeedItem[];
  fetchedAt: string;
  errors: string[];
}

export interface NzbItem {
  title: string;
  link: string;
  size: string;
  category: string;
  pubDate: string;
}

export interface NzbData {
  configured: boolean;
  items: NzbItem[];
  error?: string;
}

export interface TrafficIncident {
  title: string;
  header: string;
  description: string;
  begin: string;
  updated: string;
  layer: string;
  priority: number;
}

export interface TrafficData {
  total: number;
  incidents: TrafficIncident[];
  fetchedAt: string;
  error?: string;
}

export interface DiskDevice {
  id: string;
  name: string;
  interfaceType: string;
  mount: string;
  totalBytes: number;
  usedBytes: number;
  percentUsed: number;
  isInternal: boolean;
  rateMBs: number;
  totalMB: number;
}

export interface MountPoint {
  path: string;
  fs: string;
  totalBytes: number;
  usedBytes: number;
  percentUsed: number;
  type: string;
}

export interface DiskData {
  devices: DiskDevice[];
  mounts: MountPoint[];
}

export interface ClaudeSessionSummary {
  sessionId: string;
  project: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheCreate: number;
  messageCount: number;
}

export interface TokenBucket {
  in: number;
  out: number;
  cacheRead: number;
  cacheCreate: number;
  total: number;
  messages: number;
}

export interface ClaudeRateLimit {
  /** 0-100, hvor meget af grænsen er brugt */
  usedPercent: number;
  /** Unix-timestamp i ms for hvornår grænsen nulstilles */
  resetsAt: number | null;
  /** Menneskeligt formateret "om 1t", "om 18t", "nu" */
  resetsIn: string;
}

export interface ClaudeRateLimits {
  /** 5-time vindue · primær brugsgrænse */
  fiveHour: ClaudeRateLimit | null;
  /** 7-dags vindue · alle modeller */
  sevenDay: ClaudeRateLimit | null;
  /** 7-dags vindue · kun Opus/Sonnet */
  sevenDayOpus: ClaudeRateLimit | null;
  /** Hvornår blev data sidst opdateret */
  updatedAt: number;
  /** True hvis data er >24h gammel — usikker */
  stale: boolean;
}

/**
 * Live-beregnede token-vinduer fra JSONL-filerne. Beregnes uafhængigt af
 * Claude Code's egen rate-limit-tracking, så de altid er friske —
 * også når brugeren ikke har kørt claude interaktivt i et stykke tid.
 */
export interface ClaudeLiveWindow {
  /** Tokens brugt i vinduet (input + output + cache) */
  tokens: number;
  /** Antal assistant-messages i vinduet */
  messages: number;
  /** Hvor mange ms fra nu til vinduet "ruller" */
  windowMs: number;
  /** Beregnet procent — kun sat hvis vi har udledt plan-grænse fra rate-limits.json */
  estimatedPercent: number | null;
  /** Vores bedste gæt på plan-grænse (sat når rate-limits.json viser samme vindue med usedPercent) */
  planLimit: number | null;
}

export interface ClaudeLiveWindows {
  fiveHour: ClaudeLiveWindow;
  sevenDay: ClaudeLiveWindow;
}

export interface ClaudeStatusData {
  /** Valgfri plan-brug fra Claude Code (hvis dump-hook er aktiveret) */
  rateLimits?: ClaudeRateLimits | null;
  /** Live-beregnede vindue-tokens fra JSONL — altid friske */
  liveWindows?: ClaudeLiveWindows;
  total: TokenBucket;
  today: TokenBucket;
  week: TokenBucket;
  yearToDate: TokenBucket;
  dailyTotals: Array<{ date: string; tokens: number }>;
  recent: ClaudeSessionSummary[];
  fetchedAt: string;
  error?: string;
}

export interface EnergyData {
  priceDK1Kr: number | null; // DKK/kWh spot
  priceDK2Kr: number | null;
  greenPct: number;
  windPct: number;
  solarPct: number;
  co2GPerKwh: number | null;
  region: "DK1" | "DK2";
  trend: Array<{ hour: string; priceKr: number }>;
  fetchedAt: string;
  error?: string;
}

export interface FlightItem {
  callsign: string;
  origin: string | null;
  altitudeKm: number;
  speedKmh: number;
  heading: number;
  verticalRate: number;
  distanceKm: number;
  bearing: number;
  onGround: boolean;
}

export interface FlightsData {
  count: number;
  radiusKm: number;
  flights: FlightItem[];
  fetchedAt: string;
  error?: string;
}

export interface SpaceWeatherData {
  kpIndex: number | null;
  auroraChance: "low" | "moderate" | "high" | "severe";
  solarWindKmS: number | null;
  xrayClass: string | null;
  trend: number[];
  fetchedAt: string;
  error?: string;
}

export interface EarthquakeItem {
  magnitude: number;
  place: string;
  depthKm: number;
  timeMs: number;
  tsunami: boolean;
  url: string;
}

export interface EarthquakesData {
  count: number;
  largest: EarthquakeItem | null;
  items: EarthquakeItem[];
  fetchedAt: string;
  error?: string;
}

export interface LightningData {
  last1h: number;
  nearestKm: number | null;
  nearestDirection: string | null;
  totalToday: number;
  hourly: number[];
  fetchedAt: string;
  error?: string;
}

export interface ApodData {
  title: string;
  explanation: string;
  imageUrl: string;
  hdUrl: string | null;
  mediaType: "image" | "video";
  date: string;
  copyright: string | null;
  fetchedAt: string;
  error?: string;
}

export interface DiscoverSlide {
  id: string;
  source: string; // fx "NASA · APOD", "Wikipedia · Dagens billede", "Vidste du?"
  title: string;
  body: string;
  imageUrl: string | null;
  date: string | null;
  link: string | null;
  credit: string | null;
}

export interface DiscoverData {
  slides: DiscoverSlide[];
  fetchedAt: string;
  error?: string;
}

export interface MoonData {
  phase: number;
  illumination: number;
  name: string;
  nextFullMoon: string;
  nextNewMoon: string;
}

export interface MarketAsset {
  symbol: string;
  name: string;
  priceDkk: number;
  change24h: number; // procent
  change7d?: number;
  unit?: string; // fx "oz", "tønde"
  marketCapDkk?: number;
  spark?: number[]; // sparkline values
}

export interface CurrencyRate {
  code: string;
  label: string;
  perDkk: number; // hvor meget 1 DKK er værd i denne valuta
  dkkPerUnit: number; // hvor meget 1 enhed koster i DKK
  change24h?: number;
}

export interface MarketsData {
  commodities: MarketAsset[];
  currencies: CurrencyRate[];
  fetchedAt: string;
  error?: string;
}

export interface GithubEventItem {
  type: string;
  repo: string;
  action?: string;
  detail?: string;
  createdAt: string;
  url?: string;
}

export interface GithubContribDay {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface GithubData {
  user: {
    login: string;
    name: string | null;
    publicRepos: number;
    followers: number;
    following: number;
    avatarUrl: string;
  } | null;
  eventsLast7d: number;
  commitsLast7d: number;
  prsOpen: number;
  starsTotal: number;
  topRepos: Array<{
    name: string;
    description: string | null;
    stars: number;
    forks: number;
    language: string | null;
    pushedAt: string;
    url: string;
  }>;
  events: GithubEventItem[];
  contrib: GithubContribDay[]; // sidste 30 dage (day buckets fra events)
  fetchedAt: string;
  error?: string;
}
