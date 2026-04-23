import SwiftUI

/// v2.0 reusable tile component per the Ultron design-handoff.
///
/// Each tile has:
/// - A 2pt coloured top border in its tone.
/// - A header row: Danish primary title (serif 15) + English subhead
///   (mono 10.5, uppercase, tracked) + optional meta block right-aligned.
/// - A content slot.
/// - Optional footer meta row.
///
/// Example:
/// ```swift
/// UltronTile(title: "Vejr", english: "Weather", tone: .amber) {
///     WeatherTileBody(...)
/// } meta: {
///     LiveDot("København")
/// }
/// ```
struct UltronTile<Content: View, Meta: View, Footer: View>: View {
    let title: String
    let english: String
    let tone: UltronTheme.TileTone
    @ViewBuilder let content: () -> Content
    @ViewBuilder let meta: () -> Meta
    @ViewBuilder let footer: () -> Footer

    @State private var hovering = false

    init(
        title: String,
        english: String,
        tone: UltronTheme.TileTone,
        @ViewBuilder content: @escaping () -> Content,
        @ViewBuilder meta: @escaping () -> Meta = { EmptyView() },
        @ViewBuilder footer: @escaping () -> Footer = { EmptyView() }
    ) {
        self.title = title
        self.english = english
        self.tone = tone
        self.content = content
        self.meta = meta
        self.footer = footer
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // 2pt coloured top border — full tile width
            Rectangle()
                .fill(tone.color)
                .frame(height: 2)

            VStack(alignment: .leading, spacing: 12) {
                header
                content()
                    .frame(maxWidth: .infinity, alignment: .leading)
                Spacer(minLength: 0)
                footer()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.top, UltronTheme.Spacing.tilePadTop)
            .padding(.horizontal, UltronTheme.Spacing.tilePadH)
            .padding(.bottom, UltronTheme.Spacing.tilePadBottom)
            .frame(maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: UltronTheme.Radius.tile, style: .continuous)
                .fill(UltronTheme.ink2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: UltronTheme.Radius.tile, style: .continuous)
                .stroke(hovering ? UltronTheme.line : UltronTheme.lineSoft, lineWidth: 1)
                .animation(UltronTheme.hoverEase, value: hovering)
        )
        .clipShape(RoundedRectangle(cornerRadius: UltronTheme.Radius.tile, style: .continuous))
        .onHover { hovering = $0 }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(title)
                .font(UltronTheme.Typography.tileTitle())
                .foregroundStyle(UltronTheme.text)
            Text(english)
                .font(UltronTheme.Typography.tileSubhead())
                .tracking(1.26)           // 10.5 × 0.12 ≈ 1.26pt
                .textCase(.uppercase)
                .foregroundStyle(UltronTheme.textFaint)
            Spacer(minLength: 8)
            meta()
        }
    }
}

// MARK: - Big-number block

/// Primary numeric focal for a tile — tinted by the tile tone, with the
/// matching icon to the left. Matches the Vejr/Sol/AQI tile hero blocks.
struct UltronBigNumberBlock<Icon: View>: View {
    let number: String
    let unit: String?
    let tone: UltronTheme.TileTone
    var size: Size = .regular
    @ViewBuilder let icon: () -> Icon

    enum Size { case regular, large }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: iconSpacing) {
            icon()
                .frame(width: iconBox, height: iconBox)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(tone.soft)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .stroke(tone.border, lineWidth: 1)
                        )
                )
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(number)
                    .font(UltronTheme.Typography.bigNumber(size: numberSize))
                    .tracking(-0.9)
                    .foregroundStyle(UltronTheme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let unit {
                    Text(unit)
                        .font(UltronTheme.Typography.bigNumber(size: unitSize))
                        .foregroundStyle(UltronTheme.textDim)
                }
            }
        }
    }

    private var iconBox: CGFloat    { size == .large ? 54 : 44 }
    private var iconSpacing: CGFloat { size == .large ? 16 : 12 }
    private var numberSize: CGFloat  { size == .large ? 42 : 34 }
    private var unitSize: CGFloat    { size == .large ? 22 : 18 }
}

// MARK: - KV grid

/// Two-column telemetry grid — mono label / sans value. Used beneath the
/// big-number block on most tiles.
struct UltronKVGrid: View {
    enum Size { case regular, large }

    let pairs: [(label: String, value: String)]
    var columns: Int = 2
    var size: Size = .regular

    var body: some View {
        let gridColumns = Array(
            repeating: GridItem(.flexible(), spacing: rowSpacingH, alignment: .leading),
            count: columns
        )
        LazyVGrid(columns: gridColumns, alignment: .leading, spacing: rowSpacingV) {
            ForEach(Array(pairs.enumerated()), id: \.offset) { _, pair in
                HStack(alignment: .firstTextBaseline) {
                    Text(pair.label)
                        .font(.custom(UltronTheme.FontName.monoRegular, size: labelSize))
                        .foregroundStyle(UltronTheme.textFaint)
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    Text(pair.value)
                        .font(UltronTheme.Typography.body(size: valueSize))
                        .foregroundStyle(UltronTheme.text)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
            }
        }
    }

    private var labelSize: CGFloat { size == .large ? 11.5 : 10.5 }
    private var valueSize: CGFloat { size == .large ? 14.5 : 12.5 }
    private var rowSpacingV: CGFloat { size == .large ? 11 : 8 }
    private var rowSpacingH: CGFloat { size == .large ? 20 : 16 }
}

// MARK: - Meta row (live dot + text)

/// Small status row used in tile meta / footers. The coloured dot matches
/// the tone or status of the row (accent = live, warn = delay, ok = good).
struct UltronMetaRow: View {
    let text: String
    var dotColor: Color = UltronTheme.accent
    var pulsing: Bool = false

    @State private var pulse = false

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(dotColor)
                .frame(width: 7, height: 7)
                .scaleEffect(pulse ? 1.0 : (pulsing ? 0.6 : 1.0))
                .opacity(pulse ? 0.55 : 1.0)
                .onAppear {
                    guard pulsing else { return }
                    withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) {
                        pulse = true
                    }
                }
            Text(text)
                .font(UltronTheme.Typography.kvLabel())
                .foregroundStyle(UltronTheme.textMute)
        }
    }
}
