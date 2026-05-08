import SwiftUI

/// Settings-pane til menubar status-items. Hver kan toggles ON/OFF; Skynet
/// HUD-app viser kun de items der er tændt. Default: alle ON undtagen Net
/// (Stats.app dækker netværks-stats).
struct SettingsMenubarPane: View {
    @State private var enabledStates: [StatItemID: Bool] = [:]

    var body: some View {
        SettingsPane(
            title: "Menubar",
            subtitle: "Vælg hvilke Skynet-stats der skal vises i menubaren. Klik på et item viser detail-menu med direkte link til cockpit."
        ) {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(StatItemID.allCases, id: \.self) { id in
                    Toggle(isOn: binding(for: id)) {
                        HStack {
                            Text(symbolFor(id))
                                .font(.system(size: 14))
                                .frame(width: 24)
                            Text(id.displayName)
                            if id == .net {
                                Text("(Stats.app dækker det fint)")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }

                Divider()
                    .padding(.vertical, 4)

                Text("Tip: Hvis du vil have endnu flere Skynet-stats senere — fx mailtriage-status eller en af dine egne automations — kan de tilføjes i `packages/hud/Skynet/Menubar/`.")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .onAppear { refreshState() }
    }

    private func binding(for id: StatItemID) -> Binding<Bool> {
        Binding(
            get: { enabledStates[id] ?? id.defaultEnabled },
            set: { newValue in
                enabledStates[id] = newValue
                MenubarStatsController.shared.setEnabled(id, newValue)
            },
        )
    }

    private func refreshState() {
        for id in StatItemID.allCases {
            enabledStates[id] = MenubarStatsController.shared.isEnabled(id)
        }
    }

    private func symbolFor(_ id: StatItemID) -> String {
        switch id {
        case .claude:   return "🤖"
        case .cpu:      return "⚡"
        case .ram:      return "💾"
        case .net:      return "↓↑"
        case .disk:     return "💿"
        case .firewall: return "🛡"
        case .jellyfin: return "🎬"
        case .paseo:    return "🤖"
        }
    }
}
