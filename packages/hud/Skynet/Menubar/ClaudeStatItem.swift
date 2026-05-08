import AppKit
import Foundation

/// Claude code 5-hour usage. Endpoint: GET /api/claude
/// Display: "🤖 47%" (5h-window). Tooltip: 5h + 7d + tokens i dag.
@MainActor
final class ClaudeStatItem: StatItemBase {
    private struct Bucket: Decodable {
        let usedPercent: Double?
        let resetsIn: String?
    }
    private struct RateLimits: Decodable {
        let fiveHour: Bucket?
        let sevenDay: Bucket?
    }
    private struct Response: Decodable {
        let rateLimits: RateLimits?
        let today: Int?
        let total: Int?
    }

    private var lastResponse: Response?

    init() {
        super.init(id: .claude, pollIntervalSec: 60)
    }

    override func poll() async {
        do {
            let resp: Response = try await PortalClient.shared.get("/api/claude")
            self.lastResponse = resp
            let pct = Int(resp.rateLimits?.fiveHour?.usedPercent ?? 0)
            setTitle("🤖 \(pct)%")
            statusItem?.menu = buildMenu()
        } catch {
            setTitle("🤖 —")
        }
    }

    override func buildMenu() -> NSMenu {
        let menu = NSMenu()
        let title = NSMenuItem(title: "Claude code", action: nil, keyEquivalent: "")
        title.isEnabled = false
        menu.addItem(title)
        menu.addItem(NSMenuItem.separator())

        if let rl = lastResponse?.rateLimits {
            if let h5 = rl.fiveHour {
                let p = Int(h5.usedPercent ?? 0)
                let r = h5.resetsIn ?? "—"
                let item = NSMenuItem(title: "5h-vindue:  \(p)%  · resetter \(r)", action: nil, keyEquivalent: "")
                item.isEnabled = false
                menu.addItem(item)
            }
            if let d7 = rl.sevenDay {
                let p = Int(d7.usedPercent ?? 0)
                let item = NSMenuItem(title: "7d-vindue:  \(p)%", action: nil, keyEquivalent: "")
                item.isEnabled = false
                menu.addItem(item)
            }
        }
        if let today = lastResponse?.today {
            let item = NSMenuItem(title: "Tokens i dag:  \(formatTokens(today))", action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
        }

        menu.addItem(NSMenuItem.separator())
        let open = NSMenuItem(title: "Åbn cockpit", action: #selector(openCockpit), keyEquivalent: "")
        open.target = self
        menu.addItem(open)
        let hide = NSMenuItem(title: "Skjul Claude", action: #selector(disable), keyEquivalent: "")
        hide.target = self
        menu.addItem(hide)
        return menu
    }

    private func formatTokens(_ n: Int) -> String {
        if n >= 1_000_000_000 { return String(format: "%.1fB", Double(n) / 1_000_000_000) }
        if n >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1_000_000) }
        if n >= 1_000 { return String(format: "%.1fk", Double(n) / 1_000) }
        return "\(n)"
    }
}
