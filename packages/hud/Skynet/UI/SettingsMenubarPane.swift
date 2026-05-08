import SwiftUI

/// Settings-pane til menubar status-items. Hver kan toggles ON/OFF; Skynet
/// HUD-app viser kun de items der er tændt. Default: alle ON undtagen Net
/// (Stats.app dækker netværks-stats).
struct SettingsMenubarPane: View {
    @State private var enabledStates: [StatItemID: Bool] = [:]

    var body: some View {
        SettingsScrollScaffold {
            VStack(alignment: .leading, spacing: 16) {
                Text("Menubar status-items")
                    .font(.title3.weight(.semibold))

                Text("Vælg hvilke Skynet-stats der skal vises i menubaren. Klik på et item i menubaren viser detail-menu med direkte link til /minimal cockpit.")
                    .font(.callout)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                Divider()

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

                Text("Tip: Hvis du vil have endnu flere Skynet-stats senere — fx mailtriage-status eller en af dine egne automations — kan de tilføjes i `packages/hud/Skynet/Menubar/`.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding(.vertical, 8)
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
