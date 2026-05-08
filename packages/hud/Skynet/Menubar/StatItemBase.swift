import AppKit
import Foundation

/// Stable identifiers brugt til UserDefaults-keys + reference fra controller.
enum StatItemID: String, CaseIterable {
    case claude   = "claude"
    case cpu      = "cpu"
    case ram      = "ram"
    case net      = "net"
    case disk     = "disk"
    case firewall = "firewall"
    case jellyfin = "jellyfin"
    case paseo    = "paseo"

    /// Default ON ved første start. Network er off fordi Stats.app dækker det.
    var defaultEnabled: Bool {
        switch self {
        case .net: return false
        default:   return true
        }
    }

    /// Display-navn brugt i settings-UI.
    var displayName: String {
        switch self {
        case .claude:   return "Claude code"
        case .cpu:      return "CPU"
        case .ram:      return "RAM"
        case .net:      return "Network"
        case .disk:     return "Disk"
        case .firewall: return "Firewall"
        case .jellyfin: return "Jellyfin"
        case .paseo:    return "Paseo agents"
        }
    }
}

/// Protocol for et menubar status-item. Hver concrete implementation:
///   1. Opretter sin egen NSStatusItem ved start()
///   2. Poller sin endpoint på sit eget interval
///   3. Opdaterer button.title med ny værdi
///   4. Bygger en NSMenu med detail-rows + "Åbn cockpit"-link
///   5. Stopper rent ved stop() — vigtigt så menubar ikke får dangling items
@MainActor
protocol StatItem: AnyObject {
    var id: StatItemID { get }
    var enabled: Bool { get set }
    var statusItem: NSStatusItem? { get set }
    var pollTimer: Timer? { get set }

    func start()
    func stop()
    func poll() async
}

/// Delt baseclass — kan ikke laves direkte fordi vi vil have value-type id.
/// Hver concrete subclass implementerer poll() + bygger sin specifikke menu.
@MainActor
class StatItemBase: NSObject, StatItem {
    let id: StatItemID
    let pollIntervalSec: Double

    var enabled: Bool {
        get { UserDefaults.standard.object(forKey: "menubar.\(id.rawValue).enabled") as? Bool ?? id.defaultEnabled }
        set { UserDefaults.standard.set(newValue, forKey: "menubar.\(id.rawValue).enabled") }
    }

    var statusItem: NSStatusItem?
    var pollTimer: Timer?

    init(id: StatItemID, pollIntervalSec: Double) {
        self.id = id
        self.pollIntervalSec = pollIntervalSec
    }

    /// Default start: opretter status-item, sætter "—" som initial title,
    /// starter poll-timer. Subclass kan override hvis specielle krav.
    func start() {
        guard statusItem == nil else { return }
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "—"
        item.button?.font = NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .regular)
        item.menu = buildMenu()
        statusItem = item

        // Initial fetch + start timer
        Task { await poll() }
        pollTimer = Timer.scheduledTimer(withTimeInterval: pollIntervalSec, repeats: true) { [weak self] _ in
            Task { await self?.poll() }
        }
    }

    func stop() {
        pollTimer?.invalidate()
        pollTimer = nil
        if let item = statusItem {
            NSStatusBar.system.removeStatusItem(item)
        }
        statusItem = nil
    }

    /// Subclass override: poll endpoint, decode, opdater button.title via setTitle().
    func poll() async {
        // base no-op
    }

    /// Convenience til subclass: opdatér title på main thread.
    func setTitle(_ s: String, attributed: NSAttributedString? = nil) {
        guard let button = statusItem?.button else { return }
        if let attr = attributed {
            button.attributedTitle = attr
        } else {
            button.title = s
        }
    }

    /// Subclass override: byg en NSMenu med detail-rows. Default har bare
    /// "Åbn cockpit" og "Disable"-toggles.
    func buildMenu() -> NSMenu {
        let menu = NSMenu()
        let title = NSMenuItem(title: id.displayName, action: nil, keyEquivalent: "")
        title.isEnabled = false
        menu.addItem(title)
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Åbn cockpit", action: #selector(openCockpit), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Skjul \(id.displayName)", action: #selector(disable), keyEquivalent: ""))
        // Sæt target på hver action-item så NSMenu kan dispatche
        for mi in menu.items {
            mi.target = self
        }
        return menu
    }

    @objc func openCockpit() {
        let url = URL(string: "http://localhost:3100/minimal")!
        NSWorkspace.shared.open(url)
    }

    @objc func disable() {
        enabled = false
        stop()
        // Notify controller så settings-UI kan opdatere
        NotificationCenter.default.post(name: .menubarStatItemDisabled, object: nil, userInfo: ["id": id.rawValue])
    }
}

extension Notification.Name {
    static let menubarStatItemDisabled = Notification.Name("menubarStatItemDisabled")
    static let menubarStatItemsChanged = Notification.Name("menubarStatItemsChanged")
}
