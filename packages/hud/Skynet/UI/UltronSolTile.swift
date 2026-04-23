import SwiftUI

/// Sol (Sun) tile — Ultron redesign, Udenfor row.
///
/// - Tone: cream
/// - 54pt icon box + 42pt serif daylight ("13h 46m")
/// - Tall sun-arc chart (82pt) with sunrise + noon + sunset tick labels
/// - 2×2 large KV grid (Solopgang · Middagssol, Solnedgang · Næste helligdag)
/// - Footer: solstice delta meta ("Forår · +3m 42s")
struct UltronSolTile: View {
    let weather: WeatherSnapshot?
    /// Latitude used for the solstice daylight-delta calculation. If nil the
    /// meta row falls back to a neutral label.
    let latitude: Double?

    var body: some View {
        UltronTile(
            title: "Sol",
            english: "Sun",
            tone: .cream
        ) {
            if let today = weather?.daily.first, let daylight = today.daylight {
                VStack(alignment: .leading, spacing: 16) {
                    UltronBigNumberBlock(
                        number: formattedDaylight(daylight),
                        unit: nil,
                        tone: .cream,
                        size: .large
                    ) {
                        Image(systemName: "sun.max.fill")
                            .font(.system(size: 28, weight: .regular))
                            .foregroundStyle(UltronTheme.accent)
                            .symbolRenderingMode(.hierarchical)
                    }
                    Text(sunCaption(for: today))
                        .font(UltronTheme.Typography.caption(size: 15))
                        .foregroundStyle(UltronTheme.textDim)
                        .fixedSize(horizontal: false, vertical: true)
                    if let sunrise = today.sunrise, let sunset = today.sunset {
                        SunArcView(sunrise: sunrise, sunset: sunset)
                            .frame(height: 82)
                    }
                    UltronKVGrid(pairs: kvPairs(today: today), size: .large)
                }
            } else {
                loadingPlaceholder
            }
        } meta: {
            EmptyView()
        } footer: {
            if let metaText = solsticeMetaText() {
                UltronMetaRow(
                    text: metaText,
                    dotColor: UltronTheme.accent,
                    pulsing: false
                )
            }
        }
    }

    // MARK: - Caption

    /// "Solen står endnu i 2t 14m" / "Solen sætter om 1t 03m". Uses the live
    /// time-of-day relative to sunrise/sunset so the caption feels alive.
    private func sunCaption(for today: WeatherSnapshot.DailyPoint) -> String {
        guard let sunrise = today.sunrise, let sunset = today.sunset else {
            return "Dagslys i dag"
        }
        let now = Date()
        if now < sunrise {
            return "Solopgang om \(relative(to: sunrise))"
        }
        if now < sunset {
            return "Solen står endnu i \(relative(to: sunset))"
        }
        let tomorrow = sunrise.addingTimeInterval(86_400)
        return "Solen er væk — op igen om \(relative(to: tomorrow))"
    }

    private func relative(to target: Date) -> String {
        let seconds = max(0, Int(target.timeIntervalSinceNow))
        let hours = seconds / 3600
        let mins = (seconds % 3600) / 60
        if hours > 0 { return String(format: "%dt %02dm", hours, mins) }
        return "\(mins)m"
    }

    // MARK: - KV pairs

    private func kvPairs(today: WeatherSnapshot.DailyPoint) -> [(label: String, value: String)] {
        var pairs: [(label: String, value: String)] = []
        let timeFormatter = DateFormatter()
        timeFormatter.locale = Locale(identifier: "da_DK")
        timeFormatter.dateFormat = "HH:mm"

        if let sunrise = today.sunrise {
            pairs.append(("Solopgang", timeFormatter.string(from: sunrise)))
        }
        if let sunrise = today.sunrise, let sunset = today.sunset {
            let transit = Date(timeIntervalSince1970:
                (sunrise.timeIntervalSince1970 + sunset.timeIntervalSince1970) / 2)
            pairs.append(("Middagssol", timeFormatter.string(from: transit)))
        }
        if let sunset = today.sunset {
            pairs.append(("Solnedgang", timeFormatter.string(from: sunset)))
        }
        if let next = DanishHolidays.next() {
            let dateFormatter = DateFormatter()
            dateFormatter.locale = Locale(identifier: "da_DK")
            dateFormatter.dateFormat = "d. MMM"
            pairs.append(("Helligdag",
                          "\(next.name) · \(dateFormatter.string(from: next.date))"))
        }
        return pairs
    }

    // MARK: - Solstice delta

    private func solsticeMetaText() -> String? {
        guard let today = weather?.daily.first,
              let todayDaylight = today.daylight,
              let latitude else { return nil }
        let solstice = SolarDateMath.lastSolstice(before: Date(), latitude: latitude)
        let delta = todayDaylight - solstice.daylightSeconds
        let season = solstice.isWinter ? "Forår" : "Vinter"
        let absSeconds = Int(abs(delta))
        let mins = absSeconds / 60
        let secs = absSeconds % 60
        let sign = delta >= 0 ? "+" : "−"
        return "\(season) · \(sign)\(mins)m \(secs)s"
    }

    // MARK: - Helpers

    private func formattedDaylight(_ seconds: TimeInterval) -> String {
        let total = Int(seconds)
        let hrs = total / 3600
        let mins = (total % 3600) / 60
        return "\(hrs)h \(mins)m"
    }

    // MARK: - Loading placeholder

    private var loadingPlaceholder: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 14) {
                RoundedRectangle(cornerRadius: 10).fill(UltronTheme.ink3)
                    .frame(width: 54, height: 54)
                RoundedRectangle(cornerRadius: 4).fill(UltronTheme.ink3)
                    .frame(width: 140, height: 44)
            }
            RoundedRectangle(cornerRadius: 4).fill(UltronTheme.ink3)
                .frame(height: 14)
                .frame(maxWidth: 180)
            RoundedRectangle(cornerRadius: 4).fill(UltronTheme.ink3)
                .frame(height: 82)
        }
        .redacted(reason: .placeholder)
    }
}

// MARK: - Sun arc chart

/// Dashed semicircle from sunrise to sunset with the current sun
/// position marked as an accent dot. Now adds mono tick labels for
/// sunrise / noon / sunset under the baseline so the arc reads on its
/// own without the old separate KV row.
private struct SunArcView: View {
    let sunrise: Date
    let sunset: Date

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let padX: CGFloat = 10
            let startX = padX
            let endX = w - padX
            let baselineY = h - 16         // leaves room for tick labels
            let peakY: CGFloat = 8

            ZStack {
                // Arc.
                Path { p in
                    p.move(to: CGPoint(x: startX, y: baselineY))
                    p.addQuadCurve(
                        to: CGPoint(x: endX, y: baselineY),
                        control: CGPoint(x: (startX + endX) / 2, y: peakY - 26)
                    )
                }
                .stroke(
                    UltronTheme.lineSoft,
                    style: StrokeStyle(lineWidth: 1, dash: [3, 4])
                )

                // Ground line.
                Path { p in
                    p.move(to: CGPoint(x: startX, y: baselineY))
                    p.addLine(to: CGPoint(x: endX, y: baselineY))
                }
                .stroke(UltronTheme.lineSoft.opacity(0.5), lineWidth: 1)

                // Sun position dot.
                sunDot(width: w, height: h, startX: startX, endX: endX,
                       baselineY: baselineY, peakY: peakY)

                // Tick labels (sunrise · noon · sunset).
                tickLabels(width: w, height: h)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: progress)
    }

    private var progress: Double {
        let now = Date()
        let total = sunset.timeIntervalSince(sunrise)
        guard total > 0 else { return 0 }
        let elapsed = now.timeIntervalSince(sunrise)
        return max(0, min(1, elapsed / total))
    }

    @ViewBuilder
    private func sunDot(width: CGFloat, height: CGFloat,
                        startX: CGFloat, endX: CGFloat,
                        baselineY: CGFloat, peakY: CGFloat) -> some View {
        let t = progress
        let x = startX + (endX - startX) * t
        let controlY = peakY - 26
        let u = 1 - t
        let y = u * u * baselineY
              + 2 * u * t * controlY
              + t * t * baselineY
        let isDay = t > 0 && t < 1
        Circle()
            .fill(isDay ? UltronTheme.accent : UltronTheme.textFaint)
            .frame(width: 11, height: 11)
            .overlay(
                Circle()
                    .stroke(UltronTheme.ink, lineWidth: 1)
            )
            .position(x: x, y: y)
    }

    private func tickLabels(width: CGFloat, height: CGFloat) -> some View {
        let transit = Date(timeIntervalSince1970:
            (sunrise.timeIntervalSince1970 + sunset.timeIntervalSince1970) / 2)
        let df: DateFormatter = {
            let d = DateFormatter()
            d.locale = Locale(identifier: "da_DK")
            d.dateFormat = "HH:mm"
            return d
        }()
        return HStack(alignment: .center, spacing: 0) {
            Text(df.string(from: sunrise))
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(df.string(from: transit))
                .frame(maxWidth: .infinity, alignment: .center)
            Text(df.string(from: sunset))
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .font(.custom(UltronTheme.FontName.monoRegular, size: 10))
        .tracking(0.6)
        .foregroundStyle(UltronTheme.textFaint)
        .padding(.horizontal, 4)
        .frame(height: 12)
        .frame(maxWidth: .infinity, alignment: .bottom)
        .offset(y: height / 2 - 6)
    }
}
