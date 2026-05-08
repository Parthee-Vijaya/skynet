import AppKit
import Foundation

/// Jellyfin library + active sessions. Endpoint: GET /api/jellyfin
/// Normalt-state: "🎬 345" (movies). Hvis nogen ser noget: "▶ 1 (parthee)".
@MainActor
final class JellyfinStatItem: StatItemBase {
    private struct Library: Decodable {
        let movies: Int?
        let shows: Int?
        let episodes: Int?
    }
    private struct Session: Decodable {
        let title: String?
        let user: String?
        let player: String?
        let progress: Double?
        let remainingMinutes: Int?
    }
    private struct Response: Decodable {
        let online: Bool?
        let library: Library?
        let sessions: [Session]?
    }

    private var lastResponse: Response?

    init() { super.init(id: .jellyfin, pollIntervalSec: 30) }

    override func poll() async {
        do {
            let r: Response = try await PortalClient.shared.get("/api/jellyfin")
            lastResponse = r
            if r.online == false {
                setTitle("🎬 —")
            } else if let sessions = r.sessions, !sessions.isEmpty {
                setTitle("▶ \(sessions.count)")
            } else {
                let movies = r.library?.movies ?? 0
                setTitle("🎬 \(movies)")
            }
            statusItem?.menu = buildMenu()
        } catch {
            setTitle("🎬 —")
        }
    }

    override func buildMenu() -> NSMenu {
        let menu = NSMenu()
        let title = NSMenuItem(title: "Jellyfin", action: nil, keyEquivalent: "")
        title.isEnabled = false
        menu.addItem(title)
        menu.addItem(NSMenuItem.separator())

        if let lib = lastResponse?.library {
            let m = NSMenuItem(title: "🎬  \(lib.movies ?? 0) film", action: nil, keyEquivalent: "")
            m.isEnabled = false; menu.addItem(m)
            let s = NSMenuItem(title: "📺  \(lib.shows ?? 0) serier", action: nil, keyEquivalent: "")
            s.isEnabled = false; menu.addItem(s)
            let e = NSMenuItem(title: "🎞  \(lib.episodes ?? 0) episoder", action: nil, keyEquivalent: "")
            e.isEnabled = false; menu.addItem(e)
        }

        if let sessions = lastResponse?.sessions, !sessions.isEmpty {
            menu.addItem(NSMenuItem.separator())
            let head = NSMenuItem(title: "Nu afspilles:", action: nil, keyEquivalent: "")
            head.isEnabled = false
            menu.addItem(head)
            for s in sessions.prefix(3) {
                let t = (s.title ?? "—").prefix(40)
                let u = s.user ?? "—"
                let p = Int(s.progress ?? 0)
                let rm = s.remainingMinutes.map { "\($0)m" } ?? "—"
                let row = NSMenuItem(title: "  \(t) · \(u) · \(p)% · \(rm) tilbage", action: nil, keyEquivalent: "")
                row.isEnabled = false
                menu.addItem(row)
            }
        }

        menu.addItem(NSMenuItem.separator())
        let openJF = NSMenuItem(title: "Åbn Jellyfin (web)", action: #selector(openJellyfin), keyEquivalent: "")
        openJF.target = self
        menu.addItem(openJF)
        let openCockpit = NSMenuItem(title: "Åbn cockpit", action: #selector(self.openCockpit), keyEquivalent: "")
        openCockpit.target = self
        menu.addItem(openCockpit)
        let hide = NSMenuItem(title: "Skjul Jellyfin", action: #selector(disable), keyEquivalent: "")
        hide.target = self
        menu.addItem(hide)
        return menu
    }

    @objc private func openJellyfin() {
        NSWorkspace.shared.open(URL(string: "http://localhost:8096/web/")!)
    }
}
