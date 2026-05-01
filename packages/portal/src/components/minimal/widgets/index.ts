// Widget barrel + registry initialisation.
// Add new widgets by: 1) creating a file in this folder, 2) registering here.
import { registerWidget } from "../widget-registry";
import { HeroWidget } from "./HeroWidget";
import { ClaudeWidget } from "./ClaudeWidget";
import { RibbonWidget } from "./RibbonWidget";
import { CpuWidgetMinimal } from "./CpuWidget";
import { RamWidgetMinimal } from "./RamWidget";
import { NetWidgetMinimal } from "./NetWidget";
import { DiskWidgetMinimal } from "./DiskWidget";
import { ServicesWidget } from "./ServicesWidget";
import { TopReposWidget } from "./TopReposWidget";
import { WeatherWidgetMinimal } from "./WeatherWidgetMinimal";
import { PlexWidgetMinimal } from "./PlexWidgetMinimal";
import { SabnzbdWidgetMinimal } from "./SabnzbdWidgetMinimal";
import { GithubWidgetMinimal } from "./GithubWidgetMinimal";
import { PaseoAgentsWidget } from "./PaseoAgentsWidget";
import { TelegramWidget } from "./TelegramWidget";

registerWidget({ id: "hero",     group: "hero",     colSpan: 8,  Component: HeroWidget });
registerWidget({ id: "claude",   group: "claude",   colSpan: 4,  Component: ClaudeWidget });
registerWidget({ id: "ribbon",   group: "system",   colSpan: 12, Component: RibbonWidget });
registerWidget({ id: "cpu",      group: "system",   colSpan: 4,  Component: CpuWidgetMinimal });
registerWidget({ id: "ram",      group: "system",   colSpan: 4,  Component: RamWidgetMinimal });
registerWidget({ id: "net",      group: "system",   colSpan: 4,  Component: NetWidgetMinimal });
// ── Row: weather (left) + plex (right) ─────────────────────────────────────
registerWidget({ id: "weather",  group: "ambient",  colSpan: 6,  Component: WeatherWidgetMinimal });
registerWidget({ id: "plex",     group: "ambient",  colSpan: 6,  Component: PlexWidgetMinimal });
// ── Row: paseo agents (left) + sabnzbd (right) ────────────────────────────
registerWidget({ id: "paseo",    group: "ambient", colSpan: 6,  Component: PaseoAgentsWidget });
registerWidget({ id: "sabnzbd",  group: "ambient",  colSpan: 6,  Component: SabnzbdWidgetMinimal });
// ── Row: telegram conversation-stream (full-width) ────────────────────────
registerWidget({ id: "telegram", group: "ambient", colSpan: 12, Component: TelegramWidget });
// ── Row: disk (left) + github personal (right) ─────────────────────────────
registerWidget({ id: "disk",     group: "system",   colSpan: 6,  Component: DiskWidgetMinimal });
registerWidget({ id: "github",   group: "ambient",  colSpan: 6,  Component: GithubWidgetMinimal });
// ── Row: services (left) + top-repos (right) — samme bredde, side om side ──
registerWidget({ id: "services", group: "services", colSpan: 6,  Component: ServicesWidget });
registerWidget({ id: "top-repos", group: "ambient", colSpan: 6,  Component: TopReposWidget });

export { getWidgets } from "../widget-registry";
