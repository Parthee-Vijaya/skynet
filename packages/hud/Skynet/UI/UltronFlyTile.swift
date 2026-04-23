import SwiftUI

/// Fly over dig (Aircraft overhead) tile — Ultron redesign.
///
/// Matches the handoff spec:
/// - Tone: mint (top border)
/// - 6-col span
/// - List of up to 3 aircraft. Each row:
///     · 34×34 compass rose (accent needle rotated to bearing)
///     · middle col: route label (serif 14.5) + callsign/type (mono)
///     · right cluster (mono 10.5, textMute, 2pt spacing):
///         FL · metres, km · bearing°
/// - Meta: accent live-dot + "ADS-B · direkte"
struct UltronFlyTile: View {
    let aircraft: [Aircraft]
    /// When nil the service has not yet resolved its first fetch.
    var lastRefresh: Date? = nil

    private var visible: [Aircraft] {
        Array(aircraft.prefix(3))
    }

    var body: some View {
        UltronTile(
            title: "Fly over dig",
            english: "Aircraft · overhead",
            tone: .mint
        ) {
            if visible.isEmpty {
                emptyState
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(Array(visible.enumerated()), id: \.offset) { _, ac in
                        row(for: ac)
                    }
                }
            }
        } meta: {
            EmptyView()
        } footer: {
            UltronMetaRow(
                text: "ADS-B · direkte",
                dotColor: UltronTheme.accent,
                pulsing: true
            )
        }
    }

    // MARK: - Row

    private func row(for ac: Aircraft) -> some View {
        HStack(alignment: .center, spacing: 12) {
            compassRose(bearing: ac.bearingDeg)
            VStack(alignment: .leading, spacing: 2) {
                Text(ac.routeLabel)
                    .font(.custom(UltronTheme.FontName.serifRoman, size: 13))
                    .foregroundStyle(UltronTheme.text)
                    .lineLimit(1)
                Text(subtitle(for: ac))
                    .font(.custom(UltronTheme.FontName.monoRegular, size: 10))
                    .foregroundStyle(UltronTheme.textMute)
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            rightCluster(for: ac)
        }
    }

    private func subtitle(for ac: Aircraft) -> String {
        let call = (ac.callsign?.isEmpty == false ? ac.callsign! : "—")
        if let type = ac.aircraftType, !type.isEmpty {
            return "\(call) · \(type)"
        }
        return call
    }

    // MARK: - Compass rose (34×34)

    private func compassRose(bearing: Double) -> some View {
        ZStack {
            Circle()
                .stroke(UltronTheme.line, lineWidth: 1)
            Rectangle()
                .fill(UltronTheme.accent)
                .frame(width: 1, height: 11)
                .offset(y: -5)
                .rotationEffect(.degrees(bearing))
        }
        .frame(width: 28, height: 28)
    }

    // MARK: - Right cluster (altitude + distance/bearing)

    private func rightCluster(for ac: Aircraft) -> some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text(altitudeLine(for: ac))
                .font(.custom(UltronTheme.FontName.monoRegular, size: 9.5))
                .foregroundStyle(UltronTheme.textMute)
                .lineLimit(1)
            Text(distanceLine(for: ac))
                .font(.custom(UltronTheme.FontName.monoRegular, size: 9.5))
                .foregroundStyle(UltronTheme.textMute)
                .lineLimit(1)
        }
    }

    private func altitudeLine(for ac: Aircraft) -> String {
        let fl = ac.altitudeFL ?? "—"
        guard let ft = ac.altitudeFeet, ft > 0 else { return fl }
        let metres = Int((Double(ft) * 0.3048).rounded())
        return "\(fl) · \(metres) m"
    }

    private func distanceLine(for ac: Aircraft) -> String {
        let km = Int(ac.distanceKm.rounded())
        let brg = Int(ac.bearingDeg.rounded())
        return "\(km) km · \(brg)°"
    }

    // MARK: - Empty

    private var emptyState: some View {
        Text(lastRefresh == nil
             ? "Venter på lokation…"
             : "Ingen fly i nærheden lige nu.")
            .font(UltronTheme.Typography.caption(size: 14))
            .foregroundStyle(UltronTheme.textDim)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
