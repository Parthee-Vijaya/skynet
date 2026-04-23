// Delt fake-data til mockup-siderne. Samme værdier renderes i 3 stilarter
// så brugeren kan sammenligne det visuelle 1:1.

export const FAKE = {
  time: "21:47",
  date: "Tirsdag 21. april",
  quote: "The light that burns twice as bright deploys half as long.",
  claude: { today: "114.3M", week: "127.8M", total: "344.8M", messages: 1134 },

  cpu: {
    load: 18,
    cores: 16,
    brand: "Apple M4 Max",
    top: [
      { name: "Microsoft Edge Helper (Renderer)", pct: 45 },
      { name: "WindowServer", pct: 38 },
      { name: "Claude Helper (Renderer)", pct: 41 },
    ],
  },

  mem: {
    percent: 42,
    used: 28.8,
    total: 64,
    top: [
      { name: "next-server (v16.1.0)", pct: 2.8 },
      { name: "Microsoft Teams WebView", pct: 2.3 },
      { name: "Claude Helper (Renderer)", pct: 1.5 },
    ],
  },

  status: {
    hostname: "Mac",
    uptime: "9d 20t 20m",
    load: "4.04 · 4.14",
    procs: 944,
    power: "AC",
    temp: "—",
    watts: "—",
    cpuPulse: 18,
    net: { down: "8.0 KB/s", up: "300.8 KB/s" },
    vpn: { country: "Online", ip: "185.111.109.18", interface: "utun18", sikker: true, flag: "🌐" },
  },

  weather: {
    city: "København",
    temp: 11,
    condition: "Klart",
    feels: 7,
    wind: 9,
    humidity: 43,
    forecast: [
      { h: "20", icon: "☀", t: 12 },
      { h: "21", icon: "☀", t: 11 },
      { h: "22", icon: "☀", t: 10 },
      { h: "23", icon: "☀", t: 9 },
      { h: "00", icon: "☾", t: 9 },
      { h: "01", icon: "☾", t: 8 },
    ],
    sunrise: "05:51",
    sunset: "20:27",
    fullmoonIn: "10 dage",
    newmoonIn: "26 dage",
    moonIllumination: 24,
    moonName: "Voksende månesegl",
  },

  discover: {
    source: "På denne dag · 2010",
    title: "Kharkiv Pact",
    body:
      "Ukraine and Russia signed the Kharkiv Pact, extending the Russian lease on naval facilities in Crimea in exchange for a multiyear discount on Russian natural gas prices.",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Kharkiv_Pact_signing.jpg/1280px-Kharkiv_Pact_signing.jpg",
    progress: 2,
    total: 10,
  },

  traffic: {
    active: 95,
    region: "DK",
    cam: "Øresund · Øst",
    imageUrl: "/api/webcam/oresund-ost",
    layers: [
      { label: "Spærret", color: "#fb7185", n: 12 },
      { label: "Vejarbejde spær.", color: "#fbbf24", n: 18 },
      { label: "Kø", color: "#fb923c", n: 9 },
      { label: "Trafik", color: "#38bdf8", n: 24 },
      { label: "Vejarbejde", color: "#a3a3a3", n: 32 },
    ],
    incidents: [
      { layer: "Kø", text: "Kø · M3 Motorring 3 · km 12 retning nord" },
      { layer: "Spærret", text: "Spærret · Vejarbejde · Rute 21 · Holbæk S" },
      { layer: "Trafik", text: "Uheld · E45 Fynske motorvej km 156" },
    ],
  },

  energy: {
    price: 1.10,
    region: "DK2",
    green: 43,
    wind: 43,
    solar: 0,
    co2: 138,
    trend: [0.83, 0.53, 0.18, 0.09, 0.07, 0.08, 0.09, 0.10, 0.46, 0.81, 1.05, 1.10],
  },

  space: {
    kp: 2.3,
    aurora: "Lav",
    solarWind: 412,
    xray: "B2.1",
  },

  flights: [
    { callsign: "SAS402", alt: 11.2, speed: 845, km: 12, bearing: 45, heading: 40 },
    { callsign: "RYR2K", alt: 9.4, speed: 780, km: 38, bearing: 135, heading: 130 },
    { callsign: "KLM1137", alt: 8.8, speed: 720, km: 24, bearing: 280, heading: 275 },
    { callsign: "DLH983", alt: 10.5, speed: 812, km: 41, bearing: 200, heading: 195 },
  ],

  earthquakes: [
    { mag: 5.8, place: "125km SSV for Tokyo", depth: 43, ago: "2t" },
    { mag: 4.9, place: "Fiji-regionen", depth: 220, ago: "7t" },
    { mag: 4.5, place: "N of Iceland", depth: 10, ago: "11t" },
  ],

  lightning: { last1h: 247, nearestKm: 18, direction: "SØ" },

  disk: { percent: 40, used: "9.5 TB", total: "24 TB" },

  air: { aqi: 28, label: "God", pm25: 8 },

  plex: { nowPlaying: 1, sessions: "Dune · Part Two", streams: 3 },
};
