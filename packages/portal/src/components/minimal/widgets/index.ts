// Widget barrel + registry initialisation.
// Add new widgets by: 1) creating a file in this folder, 2) registering here.
//
// Adaptive grid (4-col base):
//   Row 1:  HERO (4 cols)
//   Row 2:  CLAUDE (2 cols) | GITHUB (2 cols)                    <- code primær
//   Row 3:  CPU | RAM | NET | DISK                                <- system kompakt
//   Row 4:  WEATHER | PASEO | TOP-REPOS | FIREWALL               <- ambient + code
//   Row 5:  JELLYFIN (2 cols) | SABNZBD (2 cols)                 <- media par
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

// Row 2 — Code primary (claude + github får begge 2 cols så de kan vise mere)
registerWidget({ id: "claude",    group: "claude",   cols: 2, category: "code",    Component: ClaudeWidget });
registerWidget({ id: "github",    group: "ambient",  cols: 2, category: "code",    Component: GithubWidgetMinimal });

// Row 3 — System kompakt (4 små i én række)
registerWidget({ id: "cpu",       group: "system",   cols: 1, category: "system",  Component: CpuWidgetMinimal });
registerWidget({ id: "ram",       group: "system",   cols: 1, category: "system",  Component: RamWidgetMinimal });
registerWidget({ id: "net",       group: "system",   cols: 1, category: "system",  Component: NetWidgetMinimal });
registerWidget({ id: "disk",      group: "system",   cols: 1, category: "system",  Component: DiskWidgetMinimal });

// Row 4 — Ambient + code secondary
registerWidget({ id: "weather",   group: "ambient",  cols: 1, category: "ambient", Component: WeatherWidgetMinimal });
registerWidget({ id: "paseo",     group: "ambient",  cols: 1, category: "code",    Component: PaseoAgentsWidget });
registerWidget({ id: "top-repos", group: "ambient",  cols: 1, category: "code",    Component: TopReposWidget });
registerWidget({ id: "firewall",  group: "system",   cols: 1, category: "system",  Component: FirewallWidget });

// Row 5 — Media par (jellyfin + sabnzbd får begge 2 cols)
registerWidget({ id: "jellyfin",  group: "ambient",  cols: 2, category: "media",   Component: JellyfinWidgetMinimal });
registerWidget({ id: "sabnzbd",   group: "ambient",  cols: 2, category: "media",   Component: SabnzbdWidgetMinimal });

// Row 6 — System ribbon (full-width)
registerWidget({ id: "ribbon",    group: "system",   cols: 4, category: "system",  Component: RibbonWidget });

// Row 7 — Service detail (full-width)
registerWidget({ id: "services",  group: "services", cols: 4, category: "system",  Component: ServicesWidget });

export { getWidgets } from "../widget-registry";
