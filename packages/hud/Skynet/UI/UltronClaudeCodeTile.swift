import SwiftUI

/// Claude Code tile — Ultron redesign. Mint tone.
/// 2×2 big-stat grid (Sessioner / Tokens i alt / I dag / Sidste uge) +
/// divider + up to 3 model rows (pretty name + cache-hit bar + percent).
struct UltronClaudeCodeTile: View {
    let stats: ClaudeStatsSnapshot

    var body: some View {
        UltronTile(title: "Claude Code", english: "Claude Code", tone: .mint) {
            VStack(alignment: .leading, spacing: 14) {
                bigStatGrid
                Rectangle().fill(UltronTheme.lineSoft).frame(height: 1)
                Text("Pr. model · cache-hit")
                    .font(.custom(UltronTheme.FontName.monoRegular, size: 10.5))
                    .tracking(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(UltronTheme.textFaint)
                ForEach(Array(stats.modelBreakdown.prefix(3).enumerated()), id: \.offset) { _, m in
                    modelRow(m)
                }
            }
        } meta: {
            UltronMetaRow(text: "live", dotColor: UltronTheme.accent, pulsing: true)
        }
    }

    private var bigStatGrid: some View {
        let cols = Array(repeating: GridItem(.flexible(), spacing: 18, alignment: .leading), count: 2)
        return LazyVGrid(columns: cols, alignment: .leading, spacing: 14) {
            statCell(value: "\(stats.totalSessions)", label: "Sessioner")
            statCell(value: formatTokens(stats.totalTokens), label: "Tokens i alt")
            statCell(value: formatTokens(stats.todayTokens), label: "I dag")
            statCell(value: formatTokens(stats.weekTokens), label: "Sidste uge")
        }
    }

    private func statCell(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(UltronTheme.Typography.bigNumber(size: 22))
                .tracking(-0.3)
                .foregroundStyle(UltronTheme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.custom(UltronTheme.FontName.monoRegular, size: 9.5))
                .tracking(0.5)
                .textCase(.uppercase)
                .foregroundStyle(UltronTheme.textFaint)
                .lineLimit(1)
        }
    }

    @ViewBuilder
    private func modelRow(_ m: ClaudeStatsSnapshot.ModelStat) -> some View {
        let pct = Int((m.cacheRatio * 100).rounded())
        HStack(spacing: 12) {
            Text(prettyName(m.name))
                .font(.custom(UltronTheme.FontName.serifRoman, size: 14))
                .foregroundStyle(UltronTheme.text)
                .frame(width: 110, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2).fill(UltronTheme.ink3)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(UltronTheme.TileTone.mint.color)
                        .frame(width: geo.size.width * min(1.0, max(0.0, m.cacheRatio)))
                }
            }
            .frame(height: 4)
            Text("\(pct) %")
                .font(.custom(UltronTheme.FontName.monoRegular, size: 11))
                .foregroundStyle(UltronTheme.text)
                .frame(width: 42, alignment: .trailing)
        }
    }

    private func prettyName(_ raw: String) -> String {
        let lower = raw.lowercased()
        let family: String
        if lower.contains("opus") { family = "Opus" }
        else if lower.contains("sonnet") { family = "Sonnet" }
        else if lower.contains("haiku") { family = "Haiku" }
        else { return raw }

        let digits = raw.replacingOccurrences(of: "_", with: "-")
            .split(separator: "-")
            .compactMap { Int($0) }
        if digits.count >= 2 {
            return "\(family) \(digits[digits.count - 2]).\(digits[digits.count - 1])"
        }
        return family
    }

    private func formatTokens(_ n: Int) -> String {
        let d = Double(n)
        if d >= 1_000_000_000 { return String(format: "%.1f mia", d / 1_000_000_000) }
        if d >= 1_000_000 { return String(format: "%.1fM", d / 1_000_000) }
        if d >= 1_000 { return String(format: "%.0fK", d / 1_000) }
        return "\(n)"
    }
}
