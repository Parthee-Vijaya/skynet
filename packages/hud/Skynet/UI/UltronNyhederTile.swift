import AppKit
import SwiftUI

/// Nyheder (News) tile — Ultron redesign.
///
/// Matches the handoff spec:
/// - Tone: cream, full-width (span 6) — no big-number block.
/// - 4 headlines. Each row: mono source chip · serif headline · mono "Xm" age.
/// - Meta: "N kilder" count of sources currently returning content.
struct UltronNyhederTile: View {
    let newsBySource: [NewsHeadline.Source: [NewsHeadline]]

    var body: some View {
        UltronTile(
            title: "Nyheder",
            english: "News",
            tone: .cream
        ) {
            VStack(alignment: .leading, spacing: 14) {
                let top = topHeadlines(count: 4)
                if top.isEmpty {
                    loadingPlaceholder
                } else {
                    ForEach(Array(top.enumerated()), id: \.offset) { _, headline in
                        headlineRow(headline)
                        if headline.id != top.last?.id {
                            Rectangle()
                                .fill(UltronTheme.lineSoft)
                                .frame(height: 1)
                                .opacity(0.6)
                        }
                    }
                }
            }
        } meta: {
            EmptyView()
        } footer: {
            let count = sourcesWithContent
            if count > 0 {
                UltronMetaRow(
                    text: "\(count) kilder",
                    dotColor: UltronTheme.accent,
                    pulsing: false
                )
            }
        }
    }

    // MARK: - Rows

    @ViewBuilder
    private func headlineRow(_ headline: NewsHeadline) -> some View {
        Button {
            if let url = headline.link {
                NSWorkspace.shared.open(url)
            }
        } label: {
            HStack(alignment: .top, spacing: 10) {
                sourceChip(headline.source)
                Text(headline.title)
                    .font(.custom(UltronTheme.FontName.serifRoman, size: 12.5))
                    .foregroundStyle(UltronTheme.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(ageLabel(for: headline))
                    .font(.custom(UltronTheme.FontName.monoRegular, size: 9.5))
                    .foregroundStyle(UltronTheme.textMute)
                    .fixedSize()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func sourceChip(_ source: NewsHeadline.Source) -> some View {
        Text(shortLabel(for: source))
            .font(.custom(UltronTheme.FontName.monoRegular, size: 9.5))
            .tracking(0.6)
            .textCase(.uppercase)
            .foregroundStyle(UltronTheme.textDim)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(UltronTheme.ink3)
            )
            .frame(minWidth: 36, alignment: .center)
    }

    private func shortLabel(for source: NewsHeadline.Source) -> String {
        switch source {
        case .dr:         return "DR"
        case .politiken:  return "POL"
        case .bbc:        return "BBC"
        case .guardian:   return "GUA"
        case .reddit:     return "RDT"
        case .hackernews: return "HN"
        }
    }

    /// Compact "12m" / "3h" / "2d" age label, or em-dash when no pubDate.
    private func ageLabel(for headline: NewsHeadline) -> String {
        guard let published = headline.publishedAt else { return "—" }
        let interval = Date().timeIntervalSince(published)
        if interval < 60 { return "nu" }
        if interval < 3600 { return "\(Int(interval / 60))m" }
        if interval < 86_400 { return "\(Int(interval / 3600))t" }
        return "\(Int(interval / 86_400))d"
    }

    // MARK: - Data selection

    /// Pick `count` headlines across all sources, newest first. When
    /// publishedAt is missing we keep whatever order the feed returned.
    private func topHeadlines(count: Int) -> [NewsHeadline] {
        let all = newsBySource.values.flatMap { $0 }
        let sorted = all.sorted { lhs, rhs in
            switch (lhs.publishedAt, rhs.publishedAt) {
            case let (l?, r?): return l > r
            case (_?, nil):    return true
            case (nil, _?):    return false
            case (nil, nil):   return false
            }
        }
        return Array(sorted.prefix(count))
    }

    private var sourcesWithContent: Int {
        newsBySource.values.reduce(0) { $0 + ($1.isEmpty ? 0 : 1) }
    }

    // MARK: - Loading placeholder

    private var loadingPlaceholder: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(0..<4, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 4).fill(UltronTheme.ink3)
                    .frame(height: 18)
            }
        }
        .redacted(reason: .placeholder)
    }
}
