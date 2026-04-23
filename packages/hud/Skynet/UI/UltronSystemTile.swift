import SwiftUI

/// System tile — Ultron redesign. Mint tone.
/// KV grid (Host / macOS / Chip / Uptime / Battery) + divider + CPU/RAM/Disk bars.
struct UltronSystemTile: View {
    let system: SystemInfoSnapshot

    var body: some View {
        UltronTile(title: "System", english: "System", tone: .mint) {
            VStack(alignment: .leading, spacing: 14) {
                UltronKVGrid(pairs: kvPairs)
                Rectangle().fill(UltronTheme.lineSoft).frame(height: 1)
                HStack(spacing: 18) {
                    bar(label: "CPU",  percent: cpuPct)
                    bar(label: "RAM",  percent: ramPct)
                    bar(label: "DISK", percent: diskPct)
                }
            }
        }
    }

    private var kvPairs: [(label: String, value: String)] {
        [
            ("Host",    system.hostname ?? "—"),
            ("macOS",   macOSLabel),
            ("Chip",    chipLabel),
            ("Uptime",  uptimeLabel),
            ("Battery", batteryLabel),
        ]
    }

    private var macOSLabel: String {
        let v = system.osVersion ?? "—"
        return v.hasPrefix("macOS ") ? String(v.dropFirst(6)) : v
    }

    private var chipLabel: String {
        guard let hw = system.hardwareSummary else { return "—" }
        for line in hw.split(separator: "\n") {
            let s = line.trimmingCharacters(in: .whitespaces)
            if s.lowercased().hasPrefix("chip:") {
                return String(s.dropFirst(5)).trimmingCharacters(in: .whitespaces)
            }
        }
        for line in hw.split(separator: "\n") {
            let s = line.trimmingCharacters(in: .whitespaces)
            if s.lowercased().hasPrefix("model name:") {
                return String(s.dropFirst(11)).trimmingCharacters(in: .whitespaces)
            }
        }
        return "—"
    }

    private var uptimeLabel: String {
        let secs = Int(ProcessInfo.processInfo.systemUptime)
        let d = secs / 86_400
        let h = (secs % 86_400) / 3600
        let m = (secs % 3600) / 60
        return String(format: "%dd %02dh %02dm", d, h, m)
    }

    private var batteryLabel: String {
        guard let p = system.batteryPercent else { return "—" }
        if let state = system.batteryState, !state.isEmpty {
            return "\(p)% \(state)"
        }
        return "\(p)%"
    }

    private var cpuPct: Double { (system.cpuLoadPercent ?? 0) * 100 }
    private var ramPct: Double {
        guard let used = system.ramUsedGB, let tot = system.ramTotalGB, tot > 0 else { return 0 }
        return (used / tot) * 100
    }
    private var diskPct: Double {
        guard let attrs = try? FileManager.default.attributesOfFileSystem(forPath: "/"),
              let size = (attrs[.systemSize] as? NSNumber)?.doubleValue,
              let free = (attrs[.systemFreeSize] as? NSNumber)?.doubleValue,
              size > 0 else { return 0 }
        return ((size - free) / size) * 100
    }

    @ViewBuilder
    private func bar(label: String, percent: Double) -> some View {
        let p = max(0, min(100, percent))
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.custom(UltronTheme.FontName.monoRegular, size: 10.5))
                .tracking(0.6)
                .textCase(.uppercase)
                .foregroundStyle(UltronTheme.textMute)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2).fill(UltronTheme.ink3)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(UltronTheme.TileTone.mint.color)
                        .frame(width: geo.size.width * (p / 100))
                }
            }
            .frame(height: 4)
            Text("\(Int(p.rounded())) %")
                .font(.custom(UltronTheme.FontName.monoRegular, size: 11))
                .foregroundStyle(UltronTheme.text)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
