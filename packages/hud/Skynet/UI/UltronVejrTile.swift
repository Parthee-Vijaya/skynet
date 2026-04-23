import SwiftUI

/// Vejr (Weather) tile — Ultron redesign, Udenfor row.
///
/// - Tone: amber
/// - 54pt icon box + 42pt serif temperature
/// - 2×2 KV grid (Føles · Vind, Fugtighed · Høj/Lav) in large style
/// - 4-step next-hours mini-trend with icon + temp + rain %
/// - Meta: live-dot + location
struct UltronVejrTile: View {
    let weather: WeatherSnapshot?

    var body: some View {
        UltronTile(
            title: "Vejr",
            english: "Weather",
            tone: .amber
        ) {
            if let w = weather {
                VStack(alignment: .leading, spacing: 16) {
                    UltronBigNumberBlock(
                        number: "\(Int(w.current.temperature.rounded()))°",
                        unit: "C",
                        tone: .amber,
                        size: .large
                    ) {
                        Image(systemName: WeatherCode.symbol(for: w.current.weatherCode))
                            .font(.system(size: 28, weight: .regular))
                            .foregroundStyle(UltronTheme.TileTone.amber.color)
                            .symbolRenderingMode(.hierarchical)
                    }
                    Text(caption(for: w.current.weatherCode))
                        .font(UltronTheme.Typography.caption(size: 15))
                        .foregroundStyle(UltronTheme.textDim)
                        .fixedSize(horizontal: false, vertical: true)
                    UltronKVGrid(pairs: kvPairs(for: w), size: .large)
                    if !nextHoursTrend(from: w).isEmpty {
                        divider
                        nextHoursStrip(trend: nextHoursTrend(from: w))
                    }
                }
            } else {
                loadingPlaceholder
            }
        } meta: {
            if let w = weather {
                UltronMetaRow(text: w.locationLabel, dotColor: UltronTheme.accent, pulsing: true)
            }
        }
    }

    // MARK: - Content helpers

    private func caption(for code: Int) -> String {
        switch code {
        case 0:           return "Klart og tørt."
        case 1, 2:        return "Let skyet, ellers roligt."
        case 3:           return "Overskyet, let regn senere."
        case 45, 48:      return "Tåge ligger lavt."
        case 51, 53, 55:  return "Støvregn i luften."
        case 61, 63, 65:  return "Regn gennem dagen."
        case 71, 73, 75:  return "Sne falder stille."
        case 80, 81, 82:  return "Byger på vej."
        case 95, 96, 99:  return "Tordenvejr trækker over."
        default:          return WeatherCode.label(for: code) + "."
        }
    }

    private func kvPairs(for w: WeatherSnapshot) -> [(label: String, value: String)] {
        var pairs: [(label: String, value: String)] = [
            ("Føles",     "\(Int(w.current.feelsLike.rounded()))°"),
            ("Vind",      "\(Int(w.current.windSpeed.rounded())) m/s \(w.current.windCompass)"),
            ("Fugtighed", "\(w.current.humidity) %"),
        ]
        if let today = w.daily.first {
            pairs.append((
                "Høj / Lav",
                "\(Int(today.tempMax.rounded()))° · \(Int(today.tempMin.rounded()))°"
            ))
        }
        return pairs
    }

    // MARK: - Next-hours mini trend

    private struct TrendPoint: Identifiable {
        let hour: Date
        let temp: Double
        let weatherCode: Int
        let precipitation: Int?
        var id: Date { hour }
    }

    /// Four forward-looking snapshots spaced ~3 hours apart starting
    /// from the next hour. Open-Meteo hourly feed is dense so we pick
    /// +3h / +6h / +9h / +12h instead of +1..+4 (those would look
    /// identical for smooth weather systems).
    private func nextHoursTrend(from w: WeatherSnapshot) -> [TrendPoint] {
        let now = Date()
        let future = w.hourly.filter { $0.time > now }
        let offsets = [3, 6, 9, 12]
        return offsets.compactMap { offset -> TrendPoint? in
            guard offset - 1 < future.count else { return nil }
            let h = future[offset - 1]
            return TrendPoint(
                hour: h.time,
                temp: h.temperature,
                weatherCode: h.weatherCode,
                precipitation: h.precipitationProbability
            )
        }
    }

    private func nextHoursStrip(trend: [TrendPoint]) -> some View {
        HStack(spacing: 0) {
            ForEach(trend) { point in
                VStack(spacing: 4) {
                    Text(Self.hourFormatter.string(from: point.hour))
                        .font(.custom(UltronTheme.FontName.monoRegular, size: 10))
                        .tracking(0.6)
                        .foregroundStyle(UltronTheme.textFaint)
                    Image(systemName: WeatherCode.symbol(for: point.weatherCode))
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(UltronTheme.TileTone.amber.color)
                        .symbolRenderingMode(.hierarchical)
                    Text("\(Int(point.temp.rounded()))°")
                        .font(.custom(UltronTheme.FontName.serifRoman, size: 15))
                        .foregroundStyle(UltronTheme.text)
                    Text(precipitationLabel(point.precipitation))
                        .font(.custom(UltronTheme.FontName.monoRegular, size: 10))
                        .foregroundStyle(precipitationColor(point.precipitation))
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    private func precipitationLabel(_ percent: Int?) -> String {
        guard let percent else { return "—" }
        return "\(percent) %"
    }

    private func precipitationColor(_ percent: Int?) -> Color {
        guard let p = percent else { return UltronTheme.textFaint }
        if p >= 60 { return UltronTheme.accent }
        if p >= 20 { return UltronTheme.textMute }
        return UltronTheme.textFaint
    }

    private var divider: some View {
        Rectangle()
            .fill(UltronTheme.lineSoft)
            .frame(height: 1)
            .opacity(0.6)
    }

    private static let hourFormatter: DateFormatter = {
        let df = DateFormatter()
        df.dateFormat = "HH"
        return df
    }()

    // MARK: - Loading placeholder

    private var loadingPlaceholder: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                RoundedRectangle(cornerRadius: 10).fill(UltronTheme.ink3)
                    .frame(width: 54, height: 54)
                RoundedRectangle(cornerRadius: 4).fill(UltronTheme.ink3)
                    .frame(width: 120, height: 44)
            }
            RoundedRectangle(cornerRadius: 4).fill(UltronTheme.ink3)
                .frame(height: 14)
                .frame(maxWidth: 200)
            RoundedRectangle(cornerRadius: 4).fill(UltronTheme.ink3)
                .frame(height: 14)
                .frame(maxWidth: 240)
        }
        .redacted(reason: .placeholder)
    }
}
