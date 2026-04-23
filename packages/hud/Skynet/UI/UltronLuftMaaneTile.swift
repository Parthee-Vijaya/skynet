import SwiftUI

/// Luft & Måne (Air & Moon) tile — Ultron redesign, Udenfor row.
///
/// - Tone: lilac
/// - 54pt icon box + 42pt serif AQI + "AQI" unit
/// - Illumination dial visualising moon phase + %
/// - 2×2 large KV grid (PM 2.5 · PM 10, UV-indeks · Måne-alder)
/// - Caption "Luft god · måne tiltagende"
struct UltronLuftMaaneTile: View {
    let airQuality: AirQualitySnapshot?
    let moon: MoonSnapshot

    var body: some View {
        UltronTile(
            title: "Luft & Måne",
            english: "Air & Moon",
            tone: .lilac
        ) {
            VStack(alignment: .leading, spacing: 16) {
                UltronBigNumberBlock(
                    number: aqiNumberText,
                    unit: "AQI",
                    tone: .lilac,
                    size: .large
                ) {
                    Image(systemName: moon.phase.symbol)
                        .font(.system(size: 28, weight: .regular))
                        .foregroundStyle(UltronTheme.TileTone.lilac.color)
                        .symbolRenderingMode(.hierarchical)
                }
                Text(caption)
                    .font(UltronTheme.Typography.caption(size: 15))
                    .foregroundStyle(UltronTheme.textDim)
                    .fixedSize(horizontal: false, vertical: true)
                moonDial
                UltronKVGrid(pairs: kvPairs, size: .large)
            }
        } meta: {
            EmptyView()
        } footer: {
            UltronMetaRow(
                text: "Næste fuldmåne · \(fullMoonFormatted)",
                dotColor: UltronTheme.TileTone.lilac.color,
                pulsing: false
            )
        }
    }

    // MARK: - Big number

    private var aqiNumberText: String {
        if let aqi = airQuality?.europeanAQI {
            return "\(aqi)"
        }
        return "—"
    }

    // MARK: - Caption

    /// "Luft god · måne tiltagende" — derived from the AQI band label and the
    /// moon phase label, both lowercased. Falls back to a neutral default.
    private var caption: String {
        let airLabel: String? = {
            guard let aq = airQuality, aq.aqiBand != .unknown else { return nil }
            return aq.aqiBand.label.lowercased()
        }()
        let moonLabel = moon.phase.label.lowercased()
        if let air = airLabel {
            return "Luft \(air) · måne \(moonLabel)"
        }
        return "Måne \(moonLabel)"
    }

    // MARK: - Moon dial

    /// Horizontal strip: small filled circle visualising illumination %
    /// on the left, then live age / phase description on the right.
    /// Gives the tile a visual anchor equivalent to the sun arc in the
    /// Sol tile so the Udenfor row feels symmetric.
    private var moonDial: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(UltronTheme.ink3)
                Circle()
                    .trim(from: 0, to: CGFloat(moon.illuminationPercent) / 100)
                    .stroke(
                        UltronTheme.TileTone.lilac.color,
                        style: StrokeStyle(lineWidth: 4, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                Text("\(moon.illuminationPercent)")
                    .font(.custom(UltronTheme.FontName.serifRoman, size: 16))
                    .foregroundStyle(UltronTheme.text)
            }
            .frame(width: 48, height: 48)

            VStack(alignment: .leading, spacing: 3) {
                Text(moon.phase.label)
                    .font(.custom(UltronTheme.FontName.serifRoman, size: 15).weight(.medium))
                    .foregroundStyle(UltronTheme.text)
                Text(ageDescription)
                    .font(.custom(UltronTheme.FontName.monoRegular, size: 11))
                    .tracking(0.4)
                    .foregroundStyle(UltronTheme.textMute)
            }

            Spacer(minLength: 0)
        }
    }

    private var ageDescription: String {
        let age = Int(moon.ageDays.rounded())
        let synodic = 29
        return "Dag \(age) / \(synodic) · \(moon.illuminationPercent) % lyst"
    }

    // MARK: - KV pairs

    private var kvPairs: [(label: String, value: String)] {
        var pairs: [(label: String, value: String)] = []

        if let pm25 = airQuality?.pm25 {
            pairs.append(("PM 2.5", String(format: "%.0f µg/m³", pm25)))
        } else {
            pairs.append(("PM 2.5", "—"))
        }

        if let pm10 = airQuality?.pm10 {
            pairs.append(("PM 10", String(format: "%.0f µg/m³", pm10)))
        } else {
            pairs.append(("PM 10", "—"))
        }

        if let uv = airQuality?.uvIndex {
            let band = airQuality?.uvBand.label.lowercased() ?? ""
            let value = String(format: "%.1f", uv)
            pairs.append(("UV-indeks", band.isEmpty ? value : "\(value) \(band)"))
        } else {
            pairs.append(("UV-indeks", "—"))
        }

        pairs.append(("Måne-alder", "\(Int(moon.ageDays.rounded())) dage"))

        return pairs
    }

    // MARK: - Full moon footer

    private var fullMoonFormatted: String {
        let df = DateFormatter()
        df.locale = Locale(identifier: "da_DK")
        df.dateFormat = "d. MMM"
        return df.string(from: moon.nextFullMoon)
    }
}
