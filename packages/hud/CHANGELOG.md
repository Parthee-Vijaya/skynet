# Changelog

## v2.0.0 — Ultron (2026-04-20)

The Cockpit + Voice + Chat panels are now one unified window. The
legacy corner HUD, separate chat panel, and Briefing panel are
retired. All hotkeys, all URL schemes, and all phase transitions
route through the same Ultron surface.

### Added

- **Unified Ultron window** — Cockpit / Voice / Chat tabs share one
  panel. Tab persistence via UserDefaults. `⌥⇧I` / `⌥ Return` /
  `⌥ Space` all open the right tab.
- **Functional traffic-light buttons** — red closes, yellow
  miniaturizes, green zooms between 1200×780 and full-screen. Hover
  reveals SF-Symbol glyphs (native macOS feel).
- **Tab-aware reload button** (`⟳` in top-bar) — Cockpit refreshes
  data, Voice resets audio meters, Chat clears session.
- **Settings gear** (`⌘ ,`) next to the reload button.
- **Live status pill** — real state per tab: Cockpit shows
  "opdateret 12s", Voice shows "Lytter · ⌥ Space" /
  "Tænker · ◌" / "Taler", Chat shows "Skriver…" /
  "Model · gemini-2.5-flash".
- **9 redesigned Cockpit tiles** —
  - Vejr: wind direction + 8-point compass (e.g. "6 m/s NV")
  - Sol: sun arc chart with live sun position
  - Luft & Måne: lilac-tinted moon icon
  - Hjem · Rute: live MapKit with charger overlays
  - Trafikinfo: 5 nearby events with icon badges
  - Fly: 3 aircraft overhead with compass rose
  - Nyheder: 4 headlines across 6 feeds
  - System: CPU/RAM/Disk bars + hardware/host
  - Netværk: WiFi/DNS/Bluetooth + RX/TX
  - Claude Code: 2×2 stat grid + per-model cache-hit bars
- **Editorial greeting header** — "COCKPIT · MANDAGSBRIEFING" kicker
  + serif hero + italic continuation + MORNING LINE side-card with
  rotating greeting from a curated 200-line library.
- **Voice tab live mic monitor** — SharedAudioEngine attaches on
  tab-open; waveform pulses + dB meter moves whenever audio arrives,
  not just during dictation. Real microphone + speaker names from
  CoreAudio HAL, re-polled every 2 s. Real Mac model from
  `sysctl hw.model`.
- **Voice → Chat handoff** — "Send til chat" pill posts the current
  transcript to the Chat tab as a user message.
- **Real Chat wiring** — `ChatSession` + `ChatCommandRouter` piped
  through; streaming indicator; agent tool invocations rendered as
  inline success/fail cards; pending-confirmation cards with
  `⌘ ↵` / `Esc` approval shortcuts.
- **Chat conversation history** — real `ConversationStore` sidebar
  grouped "I dag" / "Tidligere" with relative ages. Right-click to
  delete.
- **Sidebar slide-in/out** — `⌘ [` toggles the history sidebar,
  state persisted per user.
- **Live per-turn stats** — `UsageTracker` gains `beginTurn()` +
  `recordTurn()`. Chat header + Voice meta row render the last
  model name, token in→out, and latency in ms on every request.
- **Self-signed dev-signing cert** — `./create-dev-signing-cert.sh`
  installs a persistent "Skynet Dev" identity so Keychain grants
  survive rebuilds. `run-dev.sh` auto-detects it.
- **Widget-cache reset utility** — `./fix-widget-cache.sh` purges
  DerivedData + re-registers the `.app` with Launch Services when
  widget extensions get stuck on placeholder data.
- **Loading states** — Hjem·Rute / Trafik / Fly tiles render
  "Venter på lokation…" on cold start instead of em-dash holes.

### Removed

- `Skynet/UI/HUDContentView.swift` — legacy corner + chat HUD host
- `Skynet/UI/InfoModeView.swift` — legacy Info panel
- `Skynet/UI/UptodateView.swift` — legacy Briefing panel
- `Skynet/UI/SkynetChatPanel.swift` — legacy chat NSPanel subclass
- ~3,000 lines of dead panel-builder code inside
  `HUDWindowController` (`presentCornerPanel`, `presentChatPanel`,
  `presentUptodatePanel`, `makeHUDContentView`,
  `resizePanelForChat`, `resizePanelForUptodate`,
  `anchorPanelTopRight`)
- `ultronRedesignEnabled` UserDefault flag — Ultron is now the only
  UI path; no toggle
- `HUDWindowController.hasGeminiKey` / `hasAnthropicKey` /
  `availableModes` — orphaned after the rewrite

### Changed

- Legacy `showChat()` / `showUptodate()` now route through
  `presentInfoPanel()` and post `ultronSwitchTabNotification` so
  an already-mounted window flips tab live.
- `UsageTracker` is now `@MainActor` + tracks per-turn stats on
  top of monthly cost.
- `SystemInfoService` re-probe: `refreshLiveMetrics()` now
  self-heals `hardwareSummary` / `hostname` when the initial probe
  failed, so the System tile populates within one 5 s tick instead
  of staying dead forever.

### Developer

- Added `ExtendedKeyUsage=codeSigning` persistent identity setup
  script, documented.
- Added `fix-widget-cache.sh` troubleshooting utility.
- `MEMORY.md` project memory records the deferred #34 MenuBarExtra
  and #35 a11y-audit backlog items with revisit triggers.
