// Widget barrel + registry initialisation.
// Add new widgets by: 1) creating a file in this folder, 2) registering here.
//
// Cockpit-layout (4-col base):
//
//   Row 1:  HERO (3 cols)            | CLAUDE (1 col)         <- hero + plan-usage til højre
//   Row 2:  RIBBON (4 cols)                                   <- service-strip mellem hero og data
//   Row 3:  CPU | RAM | NET | DISK                            <- system instruments
//   Row 4:  GITHUB (2)               | TOP-REPOS (2)          <- code primær + trending
//   Row 5:  FIREWALL (4 cols)                                  <- network monitor full-width
//   Row 6:  WEATHER | PASEO | JELLYFIN | SABNZBD               <- kompakte status
//   Row 7:  SERVICES (4)
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

// Row 1 — Hero + Claude side-by-side (claude plan-usage er primær "current
// state"-indikator; hører hjemme ved klokken)
registerWidget({ id: "hero",      group: "hero",     cols: 3, category: "hero",    Component: HeroWidget });
registerWidget({ id: "claude",    group: "claude",   cols: 1, category: "code",    Component: ClaudeWidget });

// Row 2 — Service ribbon: kompakt status-strip (daemon/portal/ntfy etc.)
// mellem hero og data-instruments. Fungerer som visuel "delimiter".
registerWidget({ id: "ribbon",    group: "system",   cols: 4, category: "system",  Component: RibbonWidget });

// Row 3 — System instruments
registerWidget({ id: "cpu",       group: "system",   cols: 1, category: "system",  Component: CpuWidgetMinimal });
registerWidget({ id: "ram",       group: "system",   cols: 1, category: "system",  Component: RamWidgetMinimal });
registerWidget({ id: "net",       group: "system",   cols: 1, category: "system",  Component: NetWidgetMinimal });
registerWidget({ id: "disk",      group: "system",   cols: 1, category: "system",  Component: DiskWidgetMinimal });

// Row 4 — Code: github personal + trending (begge har lister, 2 cols hver)
registerWidget({ id: "github",    group: "ambient",  cols: 2, category: "code",    Component: GithubWidgetMinimal });
registerWidget({ id: "top-repos", group: "ambient",  cols: 2, category: "code",    Component: TopReposWidget });

// Row 5 — Firewall full-width (top-talkers + alerts + flow-stats kræver bredde)
registerWidget({ id: "firewall",  group: "system",   cols: 4, category: "system",  Component: FirewallWidget });

// Row 6 — Kompakte status-widgets samlet
registerWidget({ id: "weather",   group: "ambient",  cols: 1, category: "ambient", Component: WeatherWidgetMinimal });
registerWidget({ id: "paseo",     group: "ambient",  cols: 1, category: "code",    Component: PaseoAgentsWidget });
registerWidget({ id: "jellyfin",  group: "ambient",  cols: 1, category: "media",   Component: JellyfinWidgetMinimal });
registerWidget({ id: "sabnzbd",   group: "ambient",  cols: 1, category: "media",   Component: SabnzbdWidgetMinimal });

// Row 7 — Service detail (full-width)
registerWidget({ id: "services",  group: "services", cols: 4, category: "system",  Component: ServicesWidget });

export { getWidgets } from "../widget-registry";
