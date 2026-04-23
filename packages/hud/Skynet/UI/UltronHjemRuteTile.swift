import SwiftUI

/// Hjem · Rute (Home · Route) tile — Ultron redesign, Din rute row.
///
/// Visual parity with the Udenfor row: `.large` big-number + KV grid,
/// 54pt icon box, live-status footer meta. Map panel holds the
/// interactive route + charger overlay.
struct UltronHjemRuteTile: View {
    let commute: CommuteEstimate?
    let chargers: [ChargerLocation]
    let destinationWeather: WeatherSnapshot?
    /// When nil the service has not yet resolved its first fetch.
    var lastRefresh: Date? = nil

    var body: some View {
        UltronTile(
            title: "Hjem · Rute",
            english: "Home · Route",
            tone: .rose
        ) {
            if let c = commute {
                HStack(alignment: .top, spacing: 22) {
                    specColumn(c)
                        .frame(width: 240, alignment: .leading)
                    mapColumn(c)
                        .frame(maxWidth: .infinity)
                }
            } else {
                loadingPlaceholder
            }
        } meta: {
            EmptyView()
        } footer: {
            if let c = commute {
                footerMeta(for: c)
            }
        }
    }

    // MARK: - Spec column (240pt)

    private func specColumn(_ c: CommuteEstimate) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            UltronBigNumberBlock(
                number: "\(Int((c.expectedTravelTime / 60).rounded()))",
                unit: "min",
                tone: .rose,
                size: .large
            ) {
                Image(systemName: "house.fill")
                    .font(.system(size: 24, weight: .regular))
                    .foregroundStyle(UltronTheme.TileTone.rose.color)
                    .symbolRenderingMode(.hierarchical)
            }
            Text("ETA \(etaString(for: c)) · \(c.toLabel)")
                .font(UltronTheme.Typography.caption(size: 15))
                .foregroundStyle(UltronTheme.textDim)
                .fixedSize(horizontal: false, vertical: true)
            UltronKVGrid(pairs: kvPairs(for: c), columns: 1, size: .large)
        }
    }

    // MARK: - Map column

    private func mapColumn(_ c: CommuteEstimate) -> some View {
        CommuteMapView(
            origin: c.origin,
            destination: c.destination,
            coordinates: c.routeCoordinates,
            chargers: chargers
        )
        .frame(minHeight: 220, maxHeight: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(UltronTheme.lineSoft, lineWidth: 1)
        )
    }

    // MARK: - KV pairs

    private func kvPairs(for c: CommuteEstimate) -> [(label: String, value: String)] {
        var pairs: [(label: String, value: String)] = []
        pairs.append(("Afstand", c.prettyDistance))
        if let baseline = c.baselineTravelTime {
            let baselineMin = Int((baseline / 60).rounded())
            let liveMin = Int((c.expectedTravelTime / 60).rounded())
            let delta = liveMin - baselineMin
            let sign = delta > 0 ? "+" : ""
            pairs.append(("Normal", "\(baselineMin) min  \(sign)\(delta)"))
        }
        pairs.append((
            "Tesla",
            String(format: "%.1f kWh · %.0f kr", c.teslaKWh, c.teslaKWh * 3.5)
        ))
        if let w = destinationWeather {
            let temp = Int(w.current.temperature.rounded())
            let label = WeatherCode.label(for: w.current.weatherCode).lowercased()
            pairs.append(("Dest.", "\(temp)° \(label)"))
        }
        pairs.append(("Ladere", "\(chargers.count) på ruten"))
        return pairs
    }

    // MARK: - Helpers

    private func etaString(for c: CommuteEstimate) -> String {
        let arrival = Date().addingTimeInterval(c.expectedTravelTime)
        let df = DateFormatter()
        df.locale = Locale(identifier: "da_DK")
        df.dateFormat = "HH:mm"
        return df.string(from: arrival)
    }

    @ViewBuilder
    private func footerMeta(for c: CommuteEstimate) -> some View {
        if let baseline = c.baselineTravelTime,
           c.expectedTravelTime - baseline > 120 {
            let delayMin = Int(((c.expectedTravelTime - baseline) / 60).rounded())
            UltronMetaRow(
                text: "+\(delayMin) min forsinkelse · live trafik",
                dotColor: UltronTheme.warn,
                pulsing: true
            )
        } else {
            UltronMetaRow(
                text: "Fri bane · \(chargers.count) ladere på ruten",
                dotColor: UltronTheme.ok,
                pulsing: false
            )
        }
    }

    // MARK: - Loading placeholder

    private var loadingPlaceholder: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(lastRefresh == nil
                 ? "Venter på lokation…"
                 : "Ingen rute sat op — tilføj hjemmeadresse i Settings.")
                .font(UltronTheme.Typography.caption(size: 14))
                .foregroundStyle(UltronTheme.textDim)
            HStack(alignment: .top, spacing: 22) {
                VStack(alignment: .leading, spacing: 12) {
                    RoundedRectangle(cornerRadius: 10).fill(UltronTheme.ink3)
                        .frame(width: 180, height: 56)
                    RoundedRectangle(cornerRadius: 4).fill(UltronTheme.ink3)
                        .frame(height: 14).frame(maxWidth: 180)
                    ForEach(0..<4) { _ in
                        RoundedRectangle(cornerRadius: 4).fill(UltronTheme.ink3)
                            .frame(height: 14)
                    }
                }
                .frame(width: 240, alignment: .leading)
                RoundedRectangle(cornerRadius: 10).fill(UltronTheme.ink3)
                    .frame(minHeight: 220, maxHeight: .infinity)
            }
            .redacted(reason: .placeholder)
        }
    }
}
