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
