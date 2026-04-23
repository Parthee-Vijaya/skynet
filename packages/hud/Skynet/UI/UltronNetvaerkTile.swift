import SwiftUI

/// Netværk tile — Ultron redesign. Coral tone.
/// KV grid (SSID / Signal / Link / Local IP / DNS / Bluetooth) + RX/TX/Loss bars.
struct UltronNetvaerkTile: View {
    let system: SystemInfoSnapshot

    var body: some View {
        UltronTile(title: "Netværk", english: "Network", tone: .coral) {
            VStack(alignment: .leading, spacing: 14) {
                UltronKVGrid(pairs: kvPairs)
                Rectangle().fill(UltronTheme.lineSoft).frame(height: 1)
                HStack(spacing: 18) {
                    bar(label: "RX",   percent: rxPct,   valueText: rxText)
                    bar(label: "TX",   percent: txPct,   valueText: txText)
                    bar(label: "LOSS", percent: 0,       valueText: "0 %")
                }
            }
        }
    }

    private var kvPairs: [(label: String, value: String)] {
        let w = system.wifi
        let bt: String
        if system.bluetoothPoweredOn {
            bt = "\(system.bluetoothConnectedDevices.count) enheder"
        } else {
            bt = "slukket"
        }
        return [
            ("SSID",     w?.ssid ?? "—"),
            ("Signal",   w?.rssi.map { "\($0) dBm" } ?? "—"),
            ("Link",     linkLabel(w?.transmitRate)),
            ("Local IP", system.localIP ?? "—"),
            ("DNS",      system.dnsServers.first ?? "—"),
            ("Bluetooth", bt),
        ]
    }

    private func linkLabel(_ mbps: Double?) -> String {
        guard let m = mbps, m > 0 else { return "—" }
        if m >= 1000 { return String(format: "%.1f Gbps", m / 1000) }
        return String(format: "%.0f Mbps", m)
    }

    private var rxPct: Double {
        guard let b = system.wifiBytesReceived else { return 0 }
        return min(1.0, Double(b) / 2_000_000_000.0) * 100
    }
    private var txPct: Double {
        guard let b = system.wifiBytesSent else { return 0 }
        return min(1.0, Double(b) / 2_000_000_000.0) * 100
    }
    private var rxText: String { formatBytes(system.wifiBytesReceived) }
    private var txText: String { formatBytes(system.wifiBytesSent) }

    private func formatBytes(_ b: UInt64?) -> String {
        guard let b = b else { return "—" }
        let d = Double(b)
        if d >= 1_000_000_000 { return String(format: "%.1f GB", d / 1_000_000_000) }
        if d >= 1_000_000 { return String(format: "%.0f MB", d / 1_000_000) }
        if d >= 1_000 { return String(format: "%.0f KB", d / 1_000) }
        return "\(b) B"
    }

    @ViewBuilder
    private func bar(label: String, percent: Double, valueText: String) -> some View {
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
                        .fill(UltronTheme.TileTone.coral.color)
                        .frame(width: geo.size.width * (p / 100))
                }
            }
            .frame(height: 4)
            Text(valueText)
                .font(.custom(UltronTheme.FontName.monoRegular, size: 11))
                .foregroundStyle(UltronTheme.text)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
