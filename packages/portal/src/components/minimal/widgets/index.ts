// Widget barrel + registry initialisation.
// Add new widgets by: 1) creating a file in this folder, 2) registering here.
//
// Adaptive grid (4-col base) — system-info først, derefter content der
// kræver mere bredde, og kompakte status-widgets sammen i bunden:
//
//   Row 1:  HERO (4 cols)
//   Row 2:  CPU | RAM | NET | DISK                       <- system instruments under hero
//   Row 3:  CLAUDE (2 cols) | GITHUB (2 cols)            <- code primær
//   Row 4:  FIREWALL (2 cols) | TOP-REPOS (2 cols)       <- begge har lister/tabeller, kræver bredde
//   Row 5:  WEATHER | PASEO | JELLYFIN | SABNZBD         <- små status-widgets sammen
//   Row 6:  RIBBON (4 cols)
//   Row 7:  SERVICES (4 cols)
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
import { JellyfinWidgetMinimal } from "./JellyfinWidgetMinimal";
import { SabnzbdWidgetMinimal } from "./SabnzbdWidgetMinimal";
import { GithubWidgetMinimal } from "./GithubWidgetMinimal";
import { PaseoAgentsWidget } from "./PaseoAgentsWidget";
import { FirewallWidget } from "./FirewallWidget";

// Row 1 — Hero (full-width)
registerWidget({ id: "hero",      group: "hero",     cols: 4, category: "hero",    Component: HeroWidget });

// Row 2 — System instruments direkte under hero (cockpit-feel: system-stats er
// det første øjet skal scanne, ikke claude/github tal)
registerWidget({ id: "cpu",       group: "system",   cols: 1, category: "system",  Component: CpuWidgetMinimal });
registerWidget({ id: "ram",       group: "system",   cols: 1, category: "system",  Component: RamWidgetMinimal });
registerWidget({ id: "net",       group: "system",   cols: 1, category: "system",  Component: NetWidgetMinimal });
registerWidget({ id: "disk",      group: "system",   cols: 1, category: "system",  Component: DiskWidgetMinimal });

// Row 3 — Code primary (claude + github har begge meget data)
registerWidget({ id: "claude",    group: "claude",   cols: 2, category: "code",    Component: ClaudeWidget });
registerWidget({ id: "github",    group: "ambient",  cols: 2, category: "code",    Component: GithubWidgetMinimal });

// Row 4 — Lister/tabeller der kræver bredde (firewall: top-talkers + alerts;
// trending: 8 repo-rows). Begge crampede ved 1 col, gives 2 cols her
registerWidget({ id: "firewall",  group: "system",   cols: 2, category: "system",  Component: FirewallWidget });
registerWidget({ id: "top-repos", group: "ambient",  cols: 2, category: "code",    Component: TopReposWidget });

// Row 5 — Små status-widgets samlet (vejr, paseo idle, jellyfin offline,
// sabnzbd idle — alle viser kompakt 1-linjes status, ingen lange lister)
registerWidget({ id: "weather",   group: "ambient",  cols: 1, category: "ambient", Component: WeatherWidgetMinimal });
registerWidget({ id: "paseo",     group: "ambient",  cols: 1, category: "code",    Component: PaseoAgentsWidget });
registerWidget({ id: "jellyfin",  group: "ambient",  cols: 1, category: "media",   Component: JellyfinWidgetMinimal });
registerWidget({ id: "sabnzbd",   group: "ambient",  cols: 1, category: "media",   Component: SabnzbdWidgetMinimal });

// Row 6 — System ribbon (full-width strip)
registerWidget({ id: "ribbon",    group: "system",   cols: 4, category: "system",  Component: RibbonWidget });

// Row 7 — Service detail (full-width)
registerWidget({ id: "services",  group: "services", cols: 4, category: "system",  Component: ServicesWidget });

export { getWidgets } from "../widget-registry";
