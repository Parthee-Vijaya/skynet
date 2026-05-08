import AppKit
import Foundation

/// Paseo agents status. Endpoint: GET /api/paseo/status
/// Display: "🤖 2▶ 1·" (running▶ idle·). Offline: "🤖 ○".
@MainActor
final class PaseoStatItem: StatItemBase {
    private struct Response: Decodable {
        let online: Bool?
        let runningAgents: Int?
        let idleAgents: Int?
        let daemonVersion: String?
    }

    private var lastResponse: Response?

    init() { super.init(id: .paseo, pollIntervalSec: 10) }

    override func poll() async {
        do {
            let r: Response = try await PortalClient.shared.get("/api/paseo/status")
            lastResponse = r
            if r.online == false {
                setTitle("🤖 ○")
            } else {
                let run = r.runningAgents ?? 0
                let idle = r.idleAgents ?? 0
                setTitle("🤖 \(run)▶ \(idle)·")
            }
            statusItem?.menu = buildMenu()
        } catch {
            setTitle("🤖 —")
        }
    }

    override func buildMenu() -> NSMenu {
        let menu = NSMenu()
        let title = NSMenuItem(title: "Paseo agents", action: nil, keyEquivalent: "")
        title.isEnabled = false
        menu.addItem(title)
        menu.addItem(NSMenuItem.separator())

        if lastResponse?.online == false {
            let off = NSMenuItem(title: "Daemon offline", action: nil, keyEquivalent: "")
            off.isEnabled = false
            menu.addItem(off)
        } else if let r = lastResponse {
            let run = NSMenuItem(title: "Aktive:  \(r.runningAgents ?? 0)", action: nil, keyEquivalent: "")
            run.isEnabled = false; menu.addItem(run)
            let idle = NSMenuItem(title: "Idle:  \(r.idleAgents ?? 0)", action: nil, keyEquivalent: "")
            idle.isEnabled = false; menu.addItem(idle)
            if let v = r.daemonVersion {
                let ver = NSMenuItem(title: "Version:  v\(v)", action: nil, keyEquivalent: "")
                ver.isEnabled = false; menu.addItem(ver)
            }
        }

        menu.addItem(NSMenuItem.separator())
        let openAgents = NSMenuItem(title: "Åbn /agents", action: #selector(openAgents), keyEquivalent: "")
        openAgents.target = self
        menu.addItem(openAgents)
        let openCockpit = NSMenuItem(title: "Åbn cockpit", action: #selector(self.openCockpit), keyEquivalent: "")
        openCockpit.target = self
        menu.addItem(openCockpit)
        let hide = NSMenuItem(title: "Skjul Paseo", action: #selector(disable), keyEquivalent: "")
        hide.target = self
        menu.addItem(hide)
        return menu
    }

    @objc private func openAgents() {
        NSWorkspace.shared.open(URL(string: "http://localhost:3100/agents")!)
    }
}
