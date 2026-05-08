// Widget barrel + registry initialisation.
// Add new widgets by: 1) creating a file in this folder, 2) registering here.
//
// Bento layout (4-col grid):
//   Row 1:  HERO (4 cols, 1 row)                                   <- full-bleed identity
//   Row 2:  CLAUDE | GITHUB | CPU | RAM                            <- compute / code
//   Row 3:  NET    | DISK   | WEATHER | PASEO                      <- system / ambient
//   Row 4:  JELLYFIN (2 cols)        | SABNZBD | TOP-REPOS         <- media + code
//   Row 5:  RIBBON (4 cols)                                        <- service strip
//   Row 6:  SERVICES (4 cols)                                      <- service detail
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

// Row 1 — Hero (full-width, 1 row)
registerWidget({ id: "hero",      group: "hero",     cols: 4, rows: 1, category: "hero",    Component: HeroWidget });

// Row 2 — Code & compute primary
registerWidget({ id: "claude",    group: "claude",   cols: 1, category: "code",    Component: ClaudeWidget });
registerWidget({ id: "github",    group: "ambient",  cols: 1, category: "code",    Component: GithubWidgetMinimal });
registerWidget({ id: "cpu",       group: "system",   cols: 1, category: "system",  Component: CpuWidgetMinimal });
registerWidget({ id: "ram",       group: "system",   cols: 1, category: "system",  Component: RamWidgetMinimal });

// Row 3 — System & ambient secondary
registerWidget({ id: "net",       group: "system",   cols: 1, category: "system",  Component: NetWidgetMinimal });
registerWidget({ id: "disk",      group: "system",   cols: 1, category: "system",  Component: DiskWidgetMinimal });
registerWidget({ id: "weather",   group: "ambient",  cols: 1, category: "ambient", Component: WeatherWidgetMinimal });
registerWidget({ id: "paseo",     group: "ambient",  cols: 1, category: "code",    Component: PaseoAgentsWidget });

// Row 4 — Media (Jellyfin tager 2 cols for stream-detail) + nedre code-strip
registerWidget({ id: "jellyfin",  group: "ambient",  cols: 2, category: "media",   Component: JellyfinWidgetMinimal });
registerWidget({ id: "sabnzbd",   group: "ambient",  cols: 1, category: "media",   Component: SabnzbdWidgetMinimal });
registerWidget({ id: "top-repos", group: "ambient",  cols: 1, category: "code",    Component: TopReposWidget });

// Row 5 — System ribbon (full-width strip)
registerWidget({ id: "ribbon",    group: "system",   cols: 4, category: "system",  Component: RibbonWidget });

// Row 6 — Service detail (full-width)
registerWidget({ id: "services",  group: "services", cols: 4, category: "system",  Component: ServicesWidget });

export { getWidgets } from "../widget-registry";
