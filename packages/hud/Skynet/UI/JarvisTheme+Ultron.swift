import SwiftUI

/// v2.0 "Ultron" design system — full redesign per the April 2026 handoff.
///
/// Colours are authored in OKLCH in the design (see `design_handoff_skynet_hud/
/// Ultron HUD.html`) and converted here to sRGB hex approximations.
/// Typography uses three bundled families: Source Serif 4 (display),
/// Geist (UI sans), JetBrains Mono (telemetry). The actual `.ttf/.otf`
/// files live in `Skynet/Resources/Fonts/` and are registered via
/// `ATSApplicationFontsPath` in Info.plist.
///
/// The legacy `SkynetTheme` (cyan/navy glass) stays alongside this for
/// now — old views keep working while we port one section at a time.
enum UltronTheme {

    // MARK: - Colour palette (OKLCH → sRGB approximations)

    static let ink        = Color(hex: 0x2B3954)  // page background
    static let ink2       = Color(hex: 0x36466A)  // card / tile bg
    static let ink3       = Color(hex: 0x42537B)  // raised surface
    static let line       = Color(hex: 0x586B91)  // hairlines
    static let lineSoft   = Color(hex: 0x4C5E83)  // subtle dividers
    static let paper      = Color(hex: 0xF2F4F8)  // inverted-surface text
    static let text       = Color(hex: 0xF2F4F8)  // primary text
    static let textDim    = Color(hex: 0xCDD3DD)  // secondary
    static let textMute   = Color(hex: 0xA6AEBC)  // tertiary
    static let textFaint  = Color(hex: 0x8690A8)  // labels / metadata
    static let accent     = Color(hex: 0x7FBBE6)  // signal cyan-blue
    static let accentSoft = Color(hex: 0x6BA0CF)
    static let ok         = Color(hex: 0x7FCBAE)  // muted teal
    static let warn       = Color(hex: 0xE5C469)  // muted amber

    /// Root background gradient — slightly darker than `ink` at the edges,
    /// so tiles in `ink2` feel lifted. Matches the HTML body bg.
    static let rootBackground = Color(hex: 0x1F2B43)

    // MARK: - Tile accent tones

    /// Each Cockpit tile is tinted with a small palette of accent tones —
    /// applied as a 2pt top border + 15% alpha fill on the big-number /
    /// weather-icon box. See the handoff README for the mapping.
    enum TileTone: String, CaseIterable {
        case cream, coral, mint, amber, lilac, rose

        var color: Color {
            switch self {
            case .cream:  return Color(hex: 0xF1E4B5)   // Sol, Nyheder
            case .coral:  return Color(hex: 0xE8966B)   // Netværk
            case .mint:   return Color(hex: 0x82D4A9)   // System, Fly, Claude
            case .amber:  return Color(hex: 0xE6C069)   // Vejr, Trafikinfo
            case .lilac:  return Color(hex: 0xC89BD8)   // Luft & Måne
            case .rose:   return Color(hex: 0xEAA19A)   // Hjem · Rute
            }
        }

        /// 15% alpha tinted background for big-number / icon-box blocks.
        var soft: Color { color.opacity(0.15) }

        /// 50% alpha border for the same blocks.
        var border: Color { color.opacity(0.50) }
    }

    // MARK: - Typography

    /// PostScript names exposed by the bundled fonts. If the font failed
    /// to register (e.g. running in a Preview without the resource bundle)
    /// SwiftUI falls back to the system default — nothing crashes.
    enum FontName {
        static let serifRoman   = "SourceSerif4Roman-Regular"
        static let serifItalic  = "SourceSerif4Italic-Italic"
        static let sansRegular  = "Geist-Regular"
        static let sansMedium   = "Geist-Medium"
        static let sansSemibold = "Geist-SemiBold"
        static let sansBold     = "Geist-Bold"
        static let monoRegular  = "JetBrainsMono-Regular"
    }

    /// Typography helpers matching the handoff type-scale. Call these
    /// directly on `Text` via `.font(...)` so the scale lives in one place.
    enum Typography {
        /// Hero H1 — "God eftermiddag. Du er hjemme …"
        static func heroH1() -> Font {
            .custom(FontName.serifRoman, size: 54).weight(.light)
        }
        /// Section H2
        static func sectionH2() -> Font {
            .custom(FontName.serifRoman, size: 22).weight(.regular)
        }
        /// Tile title (Danish primary)
        static func tileTitle() -> Font {
            .custom(FontName.serifRoman, size: 15).weight(.medium)
        }
        /// Tile subhead (English, mono, tracking 0.12em, uppercase).
        /// Combine with `.kerning(1.68)` (= 14px * 0.12) + `.textCase(.uppercase)`.
        static func tileSubhead() -> Font {
            .custom(FontName.monoRegular, size: 10.5).weight(.regular)
        }
        /// Big numeric — 44pt light serif with slight negative tracking.
        static func bigNumber(size: CGFloat = 44) -> Font {
            .custom(FontName.serifRoman, size: size).weight(.light)
        }
        /// Italic caption ("Overskyet, let regn senere").
        static func caption(size: CGFloat = 14) -> Font {
            .custom(FontName.serifItalic, size: size)
        }
        /// Body sans (default UI text).
        static func body(size: CGFloat = 14) -> Font {
            .custom(FontName.sansRegular, size: size)
        }
        /// Body sans semibold (buttons etc).
        static func bodySemibold(size: CGFloat = 14) -> Font {
            .custom(FontName.sansSemibold, size: size)
        }
        /// Telemetry KV label — "Føles", "Vind", "PM 2.5".
        static func kvLabel() -> Font {
            .custom(FontName.monoRegular, size: 11.5)
        }
        /// Small uppercase mono kicker — tracking 0.22em.
        static func kicker() -> Font {
            .custom(FontName.monoRegular, size: 10.5)
        }
    }

    // MARK: - Motion

    /// Canonical hover/focus easing — matches the 160ms ease the HTML uses.
    static let hoverEase = Animation.easeInOut(duration: 0.16)

    /// Voice-HUD state transitions — a touch slower for the waveform swap.
    static let stateEase = Animation.easeInOut(duration: 0.24)

    // MARK: - Radius / spacing constants

    enum Radius {
        static let tile: CGFloat = 14
        static let card: CGFloat = 22      // Voice HUD
        static let composer: CGFloat = 12  // Chat composer / hotkey sheet
    }

    enum Spacing {
        static let gridGap: CGFloat = 16
        static let tilePadTop: CGFloat = 18
        static let tilePadH: CGFloat = 20
        static let tilePadBottom: CGFloat = 20
        static let sectionTop: CGFloat = 40
        static let sectionBottom: CGFloat = 18
    }
}

// MARK: - Color hex initialiser

extension Color {
    /// 0xRRGGBB integer → SwiftUI Color. Alpha defaults to 1.
    init(hex: UInt32, alpha: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8)  & 0xFF) / 255.0
        let b = Double( hex        & 0xFF) / 255.0
        self = Color(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}
