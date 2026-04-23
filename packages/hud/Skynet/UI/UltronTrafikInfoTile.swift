import SwiftUI

/// Trafikinfo nær dig (Traffic info near you) tile — Ultron redesign,
/// Din rute row.
///
/// - Tone: amber
/// - Category breakdown bar at top (proportional strip, coloured per
///   DATEX II category, with label + count chips)
/// - 5 nearby events: 32×32 tinted icon badge + serif headline + mono
///   relative time (coloured by age)
/// - Footer: "DK · N aktive · M uheld" live-dot
struct UltronTrafikInfoTile: View {
    let events: [TrafficEvent]
    let totalCount: Int
    let countByCategory: [(TrafficEvent.Category, Int)]
    var lastRefresh: Date? = nil

    private var visibleEvents: [TrafficEvent] {
        Array(events.prefix(5))
    }

    var body: some View {
        UltronTile(
            title: "Trafikinfo nær dig",
            english: "Traffic · nearby",
            tone: .amber
        ) {
            VStack(alignment: .leading, spacing: 16) {
                categoryBreakdown
                if visibleEvents.isEmpty {
                    emptyState
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(visibleEvents.enumerated()), id: \.offset) { _, event in
                            row(for: event)
                        }
                    }
                }
            }
        } meta: {
            EmptyView()
        } footer: {
            UltronMetaRow(
                text: footerText,
                dotColor: UltronTheme.warn,
                pulsing: totalCount > 0
            )
        }
    }

    // MARK: - Category breakdown bar

    /// Proportional horizontal strip showing the national-scope event
    /// split by DATEX II category — one coloured segment per category,
    /// widths weighted by count. Gives the tile a glanceable "what's
    /// happening in DK" summary above the local event list.
    @ViewBuilder
    private var categoryBreakdown: some View {
        let total = max(1, countByCategory.reduce(0) { $0 + $1.1 })
        if total > 1 {
            VStack(alignment: .leading, spacing: 8) {
                GeometryReader { geo in
                    HStack(spacing: 2) {
                        ForEach(Array(countByCategory.enumerated()), id: \.offset) { _, pair in
                            let (category, count) = pair
                            let width = geo.size.width * CGFloat(count) / CGFloat(total)
                            Rectangle()
                                .fill(tintColor(for: category))
                                .frame(width: max(0, width - 2))
                        }
                    }
                }
                .frame(height: 8)
                .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))

                // Legend chips — max 3 so the row doesn't wrap.
                HStack(spacing: 10) {
                    ForEach(Array(countByCategory.prefix(3).enumerated()), id: \.offset) { _, pair in
                        legendChip(category: pair.0, count: pair.1)
                    }
                    Spacer(minLength: 0)
                }
            }
        } else if lastRefresh == nil {
            Text("Venter på lokation…")
                .font(UltronTheme.Typography.caption(size: 14))
                .foregroundStyle(UltronTheme.textDim)
        }
    }

    private func legendChip(category: TrafficEvent.Category, count: Int) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(tintColor(for: category))
                .frame(width: 7, height: 7)
            Text("\(count)")
                .font(.custom(UltronTheme.FontName.monoRegular, size: 11))
                .tracking(0.4)
                .foregroundStyle(UltronTheme.text)
            Text(categoryLabel(for: category).lowercased())
                .font(.custom(UltronTheme.FontName.monoRegular, size: 10))
                .tracking(0.4)
                .foregroundStyle(UltronTheme.textMute)
        }
    }

    // MARK: - Event row

    private func row(for event: TrafficEvent) -> some View {
        HStack(alignment: .top, spacing: 12) {
            iconBadge(for: event.category)
            headerText(for: event)
                .font(.custom(UltronTheme.FontName.serifRoman, size: 13.5))
                .foregroundStyle(UltronTheme.text)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let ago = event.timeAgoLabel() {
                Text(ago)
                    .font(.custom(UltronTheme.FontName.monoRegular, size: 10))
                    .foregroundStyle(ageColor(event))
                    .fixedSize(horizontal: true, vertical: false)
            }
        }
    }

    /// Bold first word + rest of header.
    private func headerText(for event: TrafficEvent) -> Text {
        let raw = event.header.isEmpty ? event.title : event.header
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard let splitIndex = trimmed.firstIndex(where: { $0 == " " || $0 == "," }) else {
            return Text(trimmed).fontWeight(.semibold)
        }
        let first = String(trimmed[..<splitIndex])
        let rest = String(trimmed[splitIndex...])
        return Text(first).fontWeight(.semibold) + Text(rest)
    }

    // MARK: - Icon badge (32×32)

    private func iconBadge(for category: TrafficEvent.Category) -> some View {
        let tint = tintColor(for: category)
        return ZStack {
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .fill(tint.opacity(0.20))
                .overlay(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .stroke(tint.opacity(0.55), lineWidth: 1)
                )
            Image(systemName: symbolName(for: category))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(tint)
        }
        .frame(width: 32, height: 32)
    }

    // MARK: - Category → tint / symbol / label

    private func tintColor(for category: TrafficEvent.Category) -> Color {
        switch category {
        case .accident:      return UltronTheme.accent
        case .animal:        return UltronTheme.warn
        case .obstruction:   return UltronTheme.TileTone.coral.color
        case .roadCondition: return UltronTheme.ok
        case .publicEvent:   return UltronTheme.TileTone.cream.color
        case .other:         return UltronTheme.textMute
        }
    }

    private func symbolName(for category: TrafficEvent.Category) -> String {
        switch category {
        case .accident:      return "exclamationmark.triangle.fill"
        case .animal:        return "hare.fill"
        case .obstruction:   return "xmark.octagon.fill"
        case .roadCondition: return "drop.triangle.fill"
        case .publicEvent:   return "flag.fill"
        case .other:         return "exclamationmark.circle.fill"
        }
    }

    private func categoryLabel(for category: TrafficEvent.Category) -> String {
        switch category {
        case .accident:      return "Uheld"
        case .animal:        return "Dyr"
        case .obstruction:   return "Spær"
        case .roadCondition: return "Vej"
        case .publicEvent:   return "Event"
        case .other:         return "Andet"
        }
    }

    /// Newer events render the time label in mute; ≥1 h aged events
    /// fade further — quick "fresh" vs "stale" signal.
    private func ageColor(_ event: TrafficEvent) -> Color {
        guard let start = event.beginDate else { return UltronTheme.textFaint }
        let age = Date().timeIntervalSince(start)
        if age < 3_600 { return UltronTheme.textMute }       // <1h
        if age < 21_600 { return UltronTheme.textFaint }      // <6h
        return UltronTheme.textFaint.opacity(0.6)             // stale
    }

    // MARK: - Footer

    private var footerText: String {
        let accidentCount = countByCategory
            .first(where: { $0.0 == .accident })?.1 ?? 0
        return "DK · \(totalCount) aktive · \(accidentCount) uheld"
    }

    // MARK: - Empty

    private var emptyState: some View {
        Text(lastRefresh == nil
             ? "Venter på lokation…"
             : "Ingen aktive hændelser i nærheden.")
            .font(UltronTheme.Typography.caption(size: 14))
            .foregroundStyle(UltronTheme.textDim)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
