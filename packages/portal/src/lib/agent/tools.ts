/**
 * Tool-definitioner til LM Studio's OpenAI-kompatible function-calling.
 *
 * Hver tool har:
 *   - OpenAI-kompatibel schema (name, description, parameters)
 *   - En handler (i dispatcher.ts) der matcher name → execute
 *
 * Sikkerhedsmodel:
 *   - Alle tools er read-først. Destruktive actions (stop/restart/quit) kræver
 *     at brugeren har sendt `X-Confirm: true` header OR accepter i UI-dialog.
 *   - Tools kalder de eksisterende `/api/control/*` endpoints internt (ikke nye
 *     codepaths → fælles auth & allowlist).
 */

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export const TOOLS: ToolSchema[] = [
  // ── Mission Control: Services ───────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "list_services",
      description:
        "List alle styrbare macOS LaunchAgents og deres status (running/loaded/stopped) med PID. Brug denne for at se hvad brugeren kan styre.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "control_service",
      description:
        "Start, stop, genstart eller forespørg status på en service ved dens launchctl-label. Destruktive actions (stop/restart) kræver bekræftelse fra brugeren.",
      parameters: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description:
              "LaunchAgent-label, fx 'com.skynet.dashboard' eller 'com.tailscale.tailscaled'",
          },
          action: {
            type: "string",
            enum: ["start", "stop", "restart", "status"],
            description: "Hvilken action der skal udføres",
          },
        },
        required: ["label", "action"],
      },
    },
  },

  // ── Mission Control: Apps ───────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "list_apps",
      description:
        "List alle styrbare macOS-apps og om de kører lige nu (fx 'LM Studio', 'Plex Media Server', 'Spotify').",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "control_app",
      description:
        "Start, fokusér eller afslut en macOS-app. 'quit' kræver bekræftelse. 'launch' åbner appen hvis den ikke kører, ellers fokuserer den.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "App-navn som det står i /Applications, fx 'Spotify'",
          },
          action: {
            type: "string",
            enum: ["launch", "focus", "quit"],
            description: "Hvilken action der skal udføres",
          },
        },
        required: ["name", "action"],
      },
    },
  },

  // ── System telemetry ────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "read_system_status",
      description:
        "Hent aktuel CPU-, memory- og system-telemetri (load, temperatur, uptime).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_disk",
      description:
        "Hent disk-forbrug: total, brugt, fri plads i GB og procent.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_weather",
      description:
        "Hent aktuel vejrinfo for brugerens lokation (temperatur, nedbør, vind, skydække) + kort prognose.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_energy",
      description:
        "Hent aktuel dansk el-spotpris (øre/kWh) for brugerens prisområde + dagens udvikling.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ── Filbrowser (read-only) ──────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "Vis indholdet af en whitelisted filsti. Tilgængelige roots: projekter, downloads, documents, desktop, logs.",
      parameters: {
        type: "object",
        properties: {
          root: {
            type: "string",
            enum: ["projekter", "downloads", "documents", "desktop", "logs"],
            description: "Root-ID",
          },
          path: {
            type: "string",
            description:
              "Relativ sti fra rootet. Tom streng = rodniveau. Fx 'skynet/src'.",
          },
        },
        required: ["root"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Læs indholdet af en tekstfil indenfor en whitelisted root. Maks 2 MB.",
      parameters: {
        type: "object",
        properties: {
          root: {
            type: "string",
            enum: ["projekter", "downloads", "documents", "desktop", "logs"],
          },
          path: {
            type: "string",
            description: "Relativ sti til filen",
          },
        },
        required: ["root", "path"],
      },
    },
  },

  // ── Discovery ───────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "run_discovery",
      description:
        "Kør auto-discovery-scan: tjek hvilke datakilder og integrationer der er klar (LM Studio, Plex, Tailscale, NASA, internet, lokation).",
      parameters: { type: "object", properties: {} },
    },
  },

  // ── Calendar (macOS Calendar.app) ───────────────────────────────────────
  {
    type: "function",
    function: {
      name: "list_calendar_events",
      description:
        "List kommende kalender-events fra macOS Calendar.app. Default: i dag. Brug 'hours' for at se længere ud i fremtiden.",
      parameters: {
        type: "object",
        properties: {
          hours: {
            type: "number",
            description: "Antal timer frem fra nu. Udelad for events i dag.",
          },
          calendars: {
            type: "array",
            items: { type: "string" },
            description:
              "Valgfri filter: kun disse kalendernavne (fx ['Arbejde', 'Hjem']). Udelad for alle kalendere.",
          },
        },
      },
    },
  },

  // ── Reminders (macOS Reminders.app) ─────────────────────────────────────
  {
    type: "function",
    function: {
      name: "list_reminders",
      description:
        "List uafsluttede påmindelser fra macOS Reminders.app. Brug 'list' for at filtrere på en bestemt liste.",
      parameters: {
        type: "object",
        properties: {
          list: {
            type: "string",
            description: "Valgfri liste-navn. Udelad for alle lister.",
          },
          includeCompleted: {
            type: "boolean",
            description: "Inkludér afsluttede (default: false)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_reminder",
      description:
        "Opret en ny påmindelse i macOS Reminders.app. Brug 'dueDate' som ISO 8601-streng hvis den har en deadline.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Påmindelsens titel (påkrævet)",
          },
          list: {
            type: "string",
            description: "Valgfri liste at lægge den i. Default: systemets default-liste.",
          },
          dueDate: {
            type: "string",
            description: "Valgfri deadline som ISO 8601, fx '2026-04-25T14:00:00'",
          },
          body: {
            type: "string",
            description: "Valgfri noter/body-tekst",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_reminder",
      description:
        "Markér en påmindelse som afsluttet. Brug id'et fra list_reminders.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Påmindelsens id (fra list_reminders)",
          },
        },
        required: ["id"],
      },
    },
  },

  // ── iMessage ────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "send_imessage",
      description:
        "Send en iMessage til en kontakt, telefonnummer eller Apple-ID via macOS Messages.app. Brug til at levere briefings, nyheder eller alerts direkte til brugerens iPhone.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description:
              "Modtager: telefonnummer med landekode (fx '+4512345678') eller iCloud-e-mail (fx 'navn@icloud.com')",
          },
          message: {
            type: "string",
            description: "Beskedteksten der skal sendes. Max ~2000 tegn.",
          },
        },
        required: ["to", "message"],
      },
    },
  },

  // ── Info: Vejr-forecast (7 dage) ─────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_forecast",
      description:
        "Hent 7-dages vejrudsigt for brugerens lokation via Open-Meteo: max/min temperatur, nedbør, vindstød, weather-code per dag. Brug ved spørgsmål om 'i morgen', 'weekenden', 'næste uge' eller 'hvornår bliver det varmt/regn'. Til nuværende vejr brug read_weather i stedet.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "Antal dage frem (1–7). Default: 7.",
          },
        },
      },
    },
  },

  // ── Info: Trafikinfo (Vejdirektoratet) ───────────────────────────────────
  {
    type: "function",
    function: {
      name: "read_traffic",
      description:
        "Hent aktuelle trafikhændelser på danske veje (motorveje + større veje): kø, vejarbejde, spærringer, ulykker. Inkluderer titel, beskrivelse, hvornår begivenheden begyndte og hvilket layer (kø/vejarbejde/spærring/etc). Brug ved spørgsmål om 'er der kø på E20', 'noget på Storebæltsbroen', 'trafiksituation'.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ── Info: Luftkvalitet + pollen ──────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "read_air_quality",
      description:
        "Hent aktuel luftkvalitet for brugerens lokation: AQI, PM2.5, PM10, NO2, ozon, UV-indeks, og pollenniveauer (birk, græs, bynke, oliven, malurt). Brug ved spørgsmål om allergi, luftforurening, om man kan løbe ude, eller om UV-indekset er højt.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ── Info: Markeder (råvarer + valuta) ────────────────────────────────────
  {
    type: "function",
    function: {
      name: "read_markets",
      description:
        "Hent aktuelle priser for råvarer (guld, sølv, Brent-olie via Yahoo) og valutakurser (EUR/USD/GBP/SEK/NOK mod DKK via ECB/Frankfurter). Inkluderer dagsændring i pct. Brug ved spørgsmål om 'guldpris', 'dollarkurs', 'oliepris'.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ── Info: Fly i nærheden ─────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "read_flights",
      description:
        "Hent fly inden for ~50km radius af brugerens lokation via OpenSky Network: callsign, oprindelsesland, højde, fart, retning. Returnerer op til 30 fly. Brug ved spørgsmål om 'hvilket fly er over mig', 'hvor mange fly i luften lige nu'.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ── Info: Månefase ──────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "read_moon",
      description:
        "Hent aktuel månefase, illumination (0-100%), fase-navn på dansk (fx 'Voksende måne', 'Fuldmåne'), og næste fuldmåne/nymåne-dato. Brug ved spørgsmål om månens fase, om det er fuldmåne, eller hvornår næste fuldmåne er.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ── Info: DAWA address-opslag ────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "lookup_address",
      description:
        "Find danske adresser via DAWA (Danmarks Adressers Web API) — gratis, ingen nøgle. Returnerer fuld adresse, postnummer, by, kommune, region og koordinater. Brug ved fuzzy adresse-input ('Vesterbrogade 1 Kbh') eller når du skal finde koordinater for et sted i Danmark.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Adresse-tekst, fx 'vesterbrogade 1 københavn' eller 'Næstved Banegårdsplads'",
          },
        },
        required: ["query"],
      },
    },
  },

  // ── Info: Wikipedia ──────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "wikipedia_summary",
      description:
        "Hent kort introduktion til en artikel på Wikipedia (default: dansk, fallback: engelsk). Returnerer titel, kort beskrivelse, første afsnit (~250 tegn) og URL. Brug ved generelle 'hvad er X', 'hvem er Y', historiske/biografiske spørgsmål — IKKE til aktuelle nyheder eller live-data.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Sidens titel/emne, fx 'Niels Bohr', 'Kvantemekanik', 'Næstved'",
          },
          lang: {
            type: "string",
            description: "Sprog-kode: 'da' (default), 'en', 'de'.",
          },
        },
        required: ["title"],
      },
    },
  },

  // ── Vejrvarsler (DMI via MeteoAlarm — gratis, ingen key) ─────────────────
  {
    type: "function",
    function: {
      name: "get_weather_warnings",
      description:
        "Hent aktuelle vejrvarsler for Danmark via MeteoAlarm (aggregerer DMI-varsler). Returnerer event-type (storm/sne/oversvømmelse/glat vej osv), niveau (yellow/orange/red), område, start- og sluttidspunkt og beskrivelse. Brug ved spørgsmål om varsler, storm, sneorkan, oversvømmelse, glat vej, kraftigt regn, hagl. Tom liste = ingen aktive varsler.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ── Opskrifter (TheMealDB — gratis, ingen key) ───────────────────────────
  {
    type: "function",
    function: {
      name: "search_recipes",
      description:
        "Søg opskrifter i TheMealDB (engelsk database, gratis). Returnerer titel, kategori, område, fulde instruktioner og ingrediensliste. Tom query → tilfældig opskrift. Fungerer bedst med engelske søgeord (fx 'pasta', 'chicken curry', 'pancakes').",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Søgeord på engelsk (fx 'pasta', 'beef stew'). Tom = tilfældig opskrift.",
          },
        },
      },
    },
  },

  // ── Reddit (gratis ingen key) ────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "reddit_search",
      description:
        "Søg på Reddit eller hent top-posts fra et bestemt subreddit. Returnerer titel, subreddit, score, antal kommentarer, URL og evt. selftext. Brug ved 'hvad sker der på r/X', 'find diskussioner om Y på Reddit', 'top posts på r/worldnews'.",
      parameters: {
        type: "object",
        properties: {
          subreddit: {
            type: "string",
            description: "Subreddit-navn uden 'r/', fx 'worldnews', 'denmark', 'programming'. Valgfri hvis 'query' er sat.",
          },
          query: {
            type: "string",
            description: "Søgeord. Hvis subreddit også er sat: søg kun i det subreddit.",
          },
          sort: {
            type: "string",
            enum: ["hot", "top", "new", "rising", "relevance"],
            description: "Sortering. Default: 'top' for subreddit-kun, 'relevance' for søgning.",
          },
          time: {
            type: "string",
            enum: ["hour", "day", "week", "month", "year", "all"],
            description: "Tidsvindue for top/relevance. Default: 'day'.",
          },
          limit: {
            type: "number",
            description: "Max antal posts (1-25). Default: 10.",
          },
        },
      },
    },
  },

  // ── NZBgeek (trending + søgning) ─────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "search_nzbgeek",
      description:
        "Søg på NZBgeek (Newznab-baseret indeks) eller hent trending film-feed. Default uden query: trending_movies. Med query: fri søgning. Returnerer titel, pubDate, IMDB-id (film), kategori, størrelse i MB, og detail-URL. Brug ved 'hvad er trending', 'find filmen X', 'hvad er der nyt af serie Y'.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Søgeord. Tom = trending-mode (kun film). Bruges ved 'find Dune', 'søg efter Oppenheimer'.",
          },
          mode: {
            type: "string",
            enum: ["trending", "search", "tv", "movie"],
            description: "'trending' = trending film-feed. 'search' = fri søgning på alt. 'tv' = TV-søgning (Newznab tvsearch). 'movie' = film-søgning. Default: 'trending' uden query, 'search' med query.",
          },
          limit: {
            type: "number",
            description: "Antal resultater (1-100). Default: 20.",
          },
        },
      },
    },
  },

  // ── Aggregeret nyhedstool ────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_news",
      description:
        "Hent aktuelle nyheder fra danske og/eller internationale RSS-feeds. Aggregerer DR, Politiken, TV2, Berlingske (DK) og BBC, Reuters, Al Jazeera, Guardian (verden). Resultater sorteres efter dato, nyeste først. Brug 'scope' til at vælge fokus.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["dk", "world", "both"],
            description: "'dk' = kun danske kilder, 'world' = kun internationale, 'both' (default) = top fra begge",
          },
          limitPerSource: {
            type: "number",
            description: "Antal nyheder pr. kilde (1-10). Default: 3.",
          },
        },
      },
    },
  },

  // ── Transit (Rejseplanen) ────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "find_train_route",
      description:
        "Find næste tog/bus/metro afgange fra en station til en anden i Danmark via Rejseplanens API. Returnerer op til 3 mulige rejser med afgangstid, ankomsttid, linje (fx 'IC42', 'Re83', 'Bus 5C'), spor, varighed og evt. omstigninger. Brug ALTID dette tool ved spørgsmål om togtider/bustider/rejser i Danmark — IKKE web_search. Hvis 'rejseplanen_access_id' ikke er konfigureret returneres en klar fejl.",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Afgangssted — stationsnavn (fx 'Næstved St'), by ('Næstved'), eller adresse ('Vesterbrogade 1, København'). Fuzzy match.",
          },
          to: {
            type: "string",
            description: "Destination — samme format som from (fx 'Hellerup St', 'Aarhus H', 'Lyngby').",
          },
          when: {
            type: "string",
            description: "Tidspunkt for rejsen som ISO-8601, fx '2026-04-28T15:30'. Default = nu. Fortolkes som DK-tid.",
          },
          isArrival: {
            type: "boolean",
            description: "Hvis true: 'when' er ankomst-tid (jeg vil være FREMME kl. X). Default false = afgang.",
          },
        },
        required: ["from", "to"],
      },
    },
  },

  // ── Telegram: send proaktiv besked ───────────────────────────────────────
  {
    type: "function",
    function: {
      name: "send_telegram_message",
      description:
        "Send en Telegram-besked til en bestemt chat_id. Modtager skal være i telegram_allowed_chat_ids-listen i settings (sikkerhed). Brug til proaktive notifikationer eller når brugeren beder dig kontakte sig via Telegram.",
      parameters: {
        type: "object",
        properties: {
          chatId: {
            type: "number",
            description: "Telegram chat_id. Findes i settings-UI'et eller fra inbound-meddelelser.",
          },
          message: {
            type: "string",
            description: "Beskedtekst (max 4096 tegn).",
          },
        },
        required: ["chatId", "message"],
      },
    },
  },

  // ── Telegram: schedule one-off reminder ──────────────────────────────────
  {
    type: "function",
    function: {
      name: "schedule_telegram_reminder",
      description:
        "Planlæg en one-off Telegram-besked der sendes på et eksakt fremtidigt tidspunkt. Bruges til 'send mig en besked 15 min før X' når brugeren chatter via Telegram. Opretter en automation med once-trigger der auto-sletter efter kørsel. Brug ALTID dette tool (ikke schedule_imessage_reminder) når brugeren chatter fra Telegram.",
      parameters: {
        type: "object",
        properties: {
          chatId: {
            type: "number",
            description: "Telegram chat_id (typisk brugerens egen — angives i system-prompten ved inbound).",
          },
          message: {
            type: "string",
            description: "Tekst der skal sendes når påmindelsen fyrer.",
          },
          sendAtIso: {
            type: "string",
            description: "Eksakt ISO-8601 tidspunkt for afsendelse, fx '2026-04-29T13:45:00+02:00'. Skal være i fremtiden.",
          },
          name: {
            type: "string",
            description: "Kort navn på påmindelsen — vises i automation-listen.",
          },
        },
        required: ["chatId", "message", "sendAtIso", "name"],
      },
    },
  },

  // ── Schedule reminder (one-off automation) ───────────────────────────────
  {
    type: "function",
    function: {
      name: "schedule_imessage_reminder",
      description:
        "Planlæg en one-off iMessage-påmindelse der sendes på et eksakt fremtidigt tidspunkt. Bruges fx til 'send mig en sms 15 minutter før toget kører' eller 'mind mig om mødet kl 13:45'. Opretter en automation med engangs-trigger der auto-sletter efter kørsel.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description:
              "Modtager: telefonnummer (fx '+4512345678') eller iCloud-e-mail. Hvis tom: brug iMessage-default fra settings.",
          },
          message: {
            type: "string",
            description:
              "Tekst der skal sendes. Vær konkret (fx 'Toget mod Valby kører om 15 min — IC42 spor 4').",
          },
          sendAtIso: {
            type: "string",
            description:
              "Eksakt ISO-8601 tidspunkt for afsendelse, fx '2026-04-28T13:45:00+02:00'. Skal være i fremtiden.",
          },
          name: {
            type: "string",
            description:
              "Kort navn på påmindelsen — vises i automation-listen, fx 'Tog Næstved → Valby'.",
          },
        },
        required: ["message", "sendAtIso", "name"],
      },
    },
  },

  // ── News (RSS) ───────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "fetch_news",
      description:
        "Hent de nyeste nyheder fra en RSS-feed URL. Returnerer op til 10 overskrifter med titel, dato og uddrag. Brug til morgen-briefings, nyheds-alerts mm. Kendte danske feeds: DR='https://feeds.dr.dk/dr-nyheder.rss', TV2='https://feeds.tv2.dk/nyheder', Børsen='https://borsen.dk/rss'.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "RSS-feed URL, fx 'https://feeds.dr.dk/dr-nyheder.rss'",
          },
          limit: {
            type: "number",
            description: "Maks antal nyheder (default: 8, max: 20)",
          },
        },
        required: ["url"],
      },
    },
  },

  // ── Web: Fetch + Search ─────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Hent en URL og returner sidens tekst-indhold (HTML strippes). Brug til at læse nyheder, dokumentation, priser, statusser eller andet fra nettet. Max ~4000 tegn returneres.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Den fulde URL der skal hentes, fx 'https://example.com/article'",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Søg på nettet og returner de 5 bedste resultater med titel, URL og uddrag. Brug til at finde aktuelle nyheder, facts eller information du ikke kender på forhånd.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Søgeforespørgslen, fx 'el-spotpris Danmark i dag'",
          },
        },
        required: ["query"],
      },
    },
  },

];

/** Tools hvor action er destruktiv → kræver X-Confirm: true */
export const DESTRUCTIVE_TOOL_ACTIONS: Record<string, string[]> = {
  control_service: ["stop", "restart"],
  control_app: ["quit"],
};

export function isDestructive(toolName: string, args: Record<string, unknown>): boolean {
  const destructive = DESTRUCTIVE_TOOL_ACTIONS[toolName];
  if (!destructive) return false;
  const action = typeof args.action === "string" ? args.action : "";
  return destructive.includes(action);
}
