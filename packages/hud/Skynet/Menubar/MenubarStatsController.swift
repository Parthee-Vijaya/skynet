import AppKit
import Foundation

/// Manager for menubar status-items. Ejer alle 8 mulige items, men vis kun
/// dem hvor `enabled == true`. Lyttes på toggle-events fra settings + fra
/// per-item "Skjul"-action.
@MainActor
final class MenubarStatsController {
    static let shared = MenubarStatsController()

    private let items: [StatItem] = [
        ClaudeStatItem(),
        CpuStatItem(),
        RamStatItem(),
        NetStatItem(),
        DiskStatItem(),
        FirewallStatItem(),
        JellyfinStatItem(),
        PaseoStatItem(),
    ]

    private init() {}

    /// Kaldes fra AppDelegate efter app-launch. Loader control-token + starter
    /// alle enabled items.
    func start() {
        Task { @MainActor in
            await PortalClient.shared.loadToken()
            for item in items where item.enabled {
                item.start()
            }
        }

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleStatItemsChanged),
            name: .menubarStatItemsChanged,
            object: nil,
        )
    }

    /// Stop alle items + fjern observer. Bruges ved app-shutdown.
    func stop() {
        for item in items {
            item.stop()
        }
        NotificationCenter.default.removeObserver(self)
    }

    /// Toggle et specifikt item. Kaldes fra settings-UI eller per-item disable.
    func setEnabled(_ id: StatItemID, _ enabled: Bool) {
        guard let item = items.first(where: { $0.id == id }) else { return }
        let wasEnabled = item.enabled
        item.enabled = enabled
        if enabled && !wasEnabled {
            item.start()
        } else if !enabled && wasEnabled {
            item.stop()
        }
        NotificationCenter.default.post(name: .menubarStatItemsChanged, object: nil)
    }

    /// Aktuel enabled-state pr. id — bruges af settings-UI.
    func isEnabled(_ id: StatItemID) -> Bool {
        items.first(where: { $0.id == id })?.enabled ?? id.defaultEnabled
    }

    @objc private func handleStatItemsChanged() {
        // Reload state for items hvis nogen blev toggle'd udenfor controller
        for item in items {
            if item.enabled && item.statusItem == nil {
                item.start()
            } else if !item.enabled && item.statusItem != nil {
                item.stop()
            }
        }
    }
}
