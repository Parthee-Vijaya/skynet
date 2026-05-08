import AppKit
import Foundation

/// Firewall flow-monitor + alert-counter. Endpoint: GET /api/firewall
/// Normalt-state: "🛡 73f". Alert-state: "! 3 alerts" med rød accent (bold).
@MainActor
final class FirewallStatItem: StatItemBase {
    private struct Response: Decodable {
        let activeFlows: Int?
        let unackedAlertCount: Int?
        let active: Bool?
    }

    private var lastResponse: Response?

    init() { super.init(id: .firewall, pollIntervalSec: 5) }

    override func poll() async {
        do {
            let r: Response = try await PortalClient.shared.get("/api/firewall")
            lastResponse = r
            let flows = r.activeFlows ?? 0
            let alerts = r.unackedAlertCount ?? 0
            if alerts > 0 {
                // Alert-mode: rødt udråbstegn så øjet fanger det
                let attr = NSMutableAttributedString(
                    string: "! \(alerts) alert\(alerts == 1 ? "" : "s")",
                    attributes: [
                        .foregroundColor: NSColor.systemRed,
                        .font: NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .bold),
                    ],
                )
                setTitle("", attributed: attr)
            } else {
                setTitle("🛡 \(flows)f")
            }
            statusItem?.menu = buildMenu()
        } catch {
            setTitle("🛡 —")
        }
    }

    override func buildMenu() -> NSMenu {
        let menu = NSMenu()
        let title = NSMenuItem(title: "Firewall · LuLu monitor", action: nil, keyEquivalent: "")
        title.isEnabled = false
        menu.addItem(title)
        menu.addItem(NSMenuItem.separator())

        let flows = lastResponse?.activeFlows ?? 0
        let alerts = lastResponse?.unackedAlertCount ?? 0
        let f = NSMenuItem(title: "Aktive flows:  \(flows)", action: nil, keyEquivalent: "")
        f.isEnabled = false
        menu.addItem(f)
        let a = NSMenuItem(title: "Unacked alerts:  \(alerts)", action: nil, keyEquivalent: "")
        a.isEnabled = false
        menu.addItem(a)

        menu.addItem(NSMenuItem.separator())
        let openFW = NSMenuItem(title: "Åbn /firewall", action: #selector(openFirewall), keyEquivalent: "")
        openFW.target = self
        menu.addItem(openFW)
        let openCockpit = NSMenuItem(title: "Åbn cockpit", action: #selector(self.openCockpit), keyEquivalent: "")
        openCockpit.target = self
        menu.addItem(openCockpit)
        let hide = NSMenuItem(title: "Skjul Firewall", action: #selector(disable), keyEquivalent: "")
        hide.target = self
        menu.addItem(hide)
        return menu
    }

    @objc private func openFirewall() {
        NSWorkspace.shared.open(URL(string: "http://localhost:3100/firewall")!)
    }
}
