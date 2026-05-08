import AppKit
import Foundation

/// System-metrics endpoint. Delt struct mellem CPU, RAM, NET, DISK items.
/// Parallel poll fra hver = 4 calls/2s er fint på localhost. Senere kan vi
/// dele én cache hvis det bliver et problem.
struct SystemSnapshot: Decodable {
    struct CPU: Decodable { let load: Double? }
    struct Memory: Decodable { let percent: Double?; let used: Double?; let total: Double? }
    struct Disk: Decodable { let percent: Double?; let used: Double?; let total: Double? }
    struct Network: Decodable { let rxSec: Double?; let txSec: Double? }

    let cpu: CPU?
    let memory: Memory?
    let disk: Disk?
    let network: Network?
}

@MainActor
final class CpuStatItem: StatItemBase {
    private var lastLoad: Double = 0

    init() { super.init(id: .cpu, pollIntervalSec: 2) }

    override func poll() async {
        do {
            let s: SystemSnapshot = try await PortalClient.shared.get("/api/system")
            lastLoad = s.cpu?.load ?? 0
            setTitle("⚡ \(Int(lastLoad))%")
        } catch {
            setTitle("⚡ —")
        }
    }
}

@MainActor
final class RamStatItem: StatItemBase {
    private var lastPct: Double = 0

    init() { super.init(id: .ram, pollIntervalSec: 2) }

    override func poll() async {
        do {
            let s: SystemSnapshot = try await PortalClient.shared.get("/api/system")
            lastPct = s.memory?.percent ?? 0
            setTitle("💾 \(Int(lastPct))%")
        } catch {
            setTitle("💾 —")
        }
    }
}

@MainActor
final class NetStatItem: StatItemBase {
    init() { super.init(id: .net, pollIntervalSec: 2) }

    override func poll() async {
        do {
            let s: SystemSnapshot = try await PortalClient.shared.get("/api/system")
            let rx = s.network?.rxSec ?? 0
            let tx = s.network?.txSec ?? 0
            setTitle("↓\(formatRate(rx)) ↑\(formatRate(tx))")
        } catch {
            setTitle("↓— ↑—")
        }
    }

    private func formatRate(_ bytesPerSec: Double) -> String {
        if bytesPerSec >= 1_048_576 { return String(format: "%.1fM", bytesPerSec / 1_048_576) }
        if bytesPerSec >= 1024 { return String(format: "%.0fK", bytesPerSec / 1024) }
        return String(format: "%.0fB", bytesPerSec)
    }
}

@MainActor
final class DiskStatItem: StatItemBase {
    init() { super.init(id: .disk, pollIntervalSec: 30) }

    override func poll() async {
        do {
            let s: SystemSnapshot = try await PortalClient.shared.get("/api/system")
            let pct = s.disk?.percent ?? 0
            setTitle("💿 \(Int(pct))%")
        } catch {
            setTitle("💿 —")
        }
    }
}
