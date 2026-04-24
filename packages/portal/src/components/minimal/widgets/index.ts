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
import { TmuxAgentsWidget } from "./TmuxAgentsWidget";

registerWidget({ id: "hero",     group: "hero",     colSpan: 8,  Component: HeroWidget });
registerWidget({ id: "claude",   group: "claude",   colSpan: 4,  Component: ClaudeWidget });
registerWidget({ id: "ribbon",   group: "system",   colSpan: 12, Component: RibbonWidget });
registerWidget({ id: "cpu",      group: "system",   colSpan: 4,  Component: CpuWidgetMinimal });
registerWidget({ id: "ram",      group: "system",   colSpan: 4,  Component: RamWidgetMinimal });
registerWidget({ id: "net",      group: "system",   colSpan: 4,  Component: NetWidgetMinimal });
// ── Row: weather (left) + plex (right) ─────────────────────────────────────
registerWidget({ id: "weather",  group: "ambient",  colSpan: 6,  Component: WeatherWidgetMinimal });
registerWidget({ id: "plex",     group: "ambient",  colSpan: 6,  Component: PlexWidgetMinimal });
// ── Row: disk (left) + services (right, spans this row AND the repos row below) ──
registerWidget({ id: "disk",     group: "system",   colSpan: 6,  Component: DiskWidgetMinimal });
registerWidget({ id: "services", group: "services", colSpan: 6,  rowSpan: 2, Component: ServicesWidget });
// ── Row: top-repos fills left 6 cols; services continues on right ──────────
registerWidget({ id: "top-repos", group: "ambient", colSpan: 6,  Component: TopReposWidget });
// ── Row: pocket agents (tmux-sessioner med coding agents) ──────────────────
registerWidget({ id: "tmux",      group: "ambient", colSpan: 6,  Component: TmuxAgentsWidget });

export { getWidgets } from "../widget-registry";
