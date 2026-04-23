import Combine
import CoreLocation
import SwiftUI

/// v2.0 Cockpit root — Ultron design. Four-section editorial layout.
///
/// - **Udenfor**: Vejr · Sol · Luft & Måne (3-col)
/// - **Din rute**: Hjem · Rute — Trafikinfo nær dig (2-col, equal)
/// - **Over & omkring**: Fly over dig — Nyheder (2-col, equal)
/// - **Din maskine**: System · Netværk · Claude Code (3-col)
///
/// Symmetric rows: uses `Grid` + `GridRow` + `.frame(maxHeight: .infinity)`
/// so each tile in a row matches the tallest sibling's height.
///
/// Live refresh: three `.task` loops keep system metrics (5 s), Claude
/// stats (15 s), and aircraft / ISS (30 s) current while the panel is
/// visible — mirroring the cadence the legacy `InfoModeView` uses.
///
/// Greeting: time-of-day hero line + rotating sub-line from the 200-line
/// `GreetingProvider` library, half the hero font size. Re-rolls every
/// 20 seconds so the Cockpit never feels scripted.
struct UltronCockpitView: View {
    @Bindable var service: InfoModeService
    let onClose: () -> Void

    @State private var greetingSeed = Int(Date().timeIntervalSince1970)
    private let greetingTick = Timer.publish(every: 20, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            UltronTheme.rootBackground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    greetingHeader
                    udenforSection
                    dinRuteSection
                    overOgOmkringSection
                    dinMaskineSection
                }
                .padding(.horizontal, 28)
                .padding(.top, 22)
                .padding(.bottom, 40)
                .frame(maxWidth: 1440, alignment: .topLeading)
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
        }
        .foregroundStyle(UltronTheme.text)
        .task { await service.refresh() }
        // Claude Code tile — 15 s cadence so totals/projects/tools stay
        // fresh without waiting on the 2-min full-panel refresh.
        .task {
            while !Task.isCancelled {
                await service.refreshClaudeStats()
                try? await Task.sleep(nanoseconds: 15_000_000_000)
            }
        }
        // CPU / RAM / WiFi / Bluetooth live metrics — 5 s cadence.
        .task {
            while !Task.isCancelled {
                await service.refreshLiveMetrics()
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            }
        }
        // Aircraft + ISS — 30 s cadence (adsb.lol rate-limit friendly).
        .task {
            while !Task.isCancelled {
                await service.refreshAircraft()
                await service.refreshISS()
                try? await Task.sleep(nanoseconds: 30_000_000_000)
            }
        }
        .onReceive(greetingTick) { _ in
            greetingSeed = Int(Date().timeIntervalSince1970)
        }
    }

    // MARK: - Greeting

    /// Two-column editorial header mirroring the handoff: left column
    /// holds the mono kicker + serif hero + italic continuation + meta
    /// row; right column holds the "MORNING LINE" card with the
    /// rotating 200-line greeting and a stable session counter.
    private var greetingHeader: some View {
        HStack(alignment: .top, spacing: 36) {
            VStack(alignment: .leading, spacing: 14) {
                Text(kickerText)
                    .font(UltronTheme.Typography.kicker())
                    .tracking(2.1)
                    .textCase(.uppercase)
                    .foregroundStyle(UltronTheme.textFaint)

                VStack(alignment: .leading, spacing: 6) {
                    Text(heroLine)
                        .font(UltronTheme.Typography.heroH1())
                        .foregroundStyle(UltronTheme.text)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(heroItalic)
                        .font(.custom(UltronTheme.FontName.serifItalic, size: 40))
                        .foregroundStyle(UltronTheme.textDim)
                        .fixedSize(horizontal: false, vertical: true)
                        .lineSpacing(2)
                }

                Text(metaLine())
                    .font(UltronTheme.Typography.kvLabel())
                    .tracking(0.5)
                    .foregroundStyle(UltronTheme.textMute)
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)

            morningLineCard
                .frame(maxWidth: 420, alignment: .topTrailing)
        }
    }

    /// Right-side card — `GreetingProvider` line + session counter.
    /// Re-rolls on the 20-second `greetingTick` timer.
    private var morningLineCard: some View {
        let nickname = UserDefaults.standard.string(forKey: "userNickname") ?? "P"
        let pair = GreetingProvider.random(name: nickname, seed: greetingSeed)
        let sessionID = String(format: "%04d", abs(greetingSeed) % 10_000)
        return VStack(alignment: .leading, spacing: 12) {
            Text("MORNING LINE")
                .font(UltronTheme.Typography.kicker())
                .tracking(2.1)
                .foregroundStyle(UltronTheme.textFaint)

            Text("\u{201C}\(pair.line)\u{201D}")
                .font(.custom(UltronTheme.FontName.serifItalic, size: 18))
                .foregroundStyle(UltronTheme.textDim)
                .fixedSize(horizontal: false, vertical: true)
                .lineSpacing(3)
                .id(greetingSeed)
                .transition(.opacity)
                .animation(.easeInOut(duration: 0.4), value: greetingSeed)

            Text("roterende hilsen · session \(sessionID)")
                .font(UltronTheme.Typography.kicker())
                .tracking(1.8)
                .foregroundStyle(UltronTheme.textFaint)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: UltronTheme.Radius.tile, style: .continuous)
                .fill(UltronTheme.ink2)
                .overlay(
                    RoundedRectangle(cornerRadius: UltronTheme.Radius.tile, style: .continuous)
                        .stroke(UltronTheme.lineSoft, lineWidth: 1)
                )
        )
    }

    // MARK: - Sections

    private var udenforSection: some View {
        VStack(alignment: .leading, spacing: 18) {
            sectionHeader(title: "Udenfor", english: "Outside", count: 3)
            Grid(alignment: .topLeading,
                 horizontalSpacing: UltronTheme.Spacing.gridGap,
                 verticalSpacing: UltronTheme.Spacing.gridGap) {
                GridRow {
                    UltronVejrTile(weather: service.weather)
                        .gridCellFilling()
                    UltronSolTile(
                        weather: service.weather,
                        latitude: service.userCoordinate?.latitude
                    )
                    .gridCellFilling()
                    UltronLuftMaaneTile(
                        airQuality: service.airQuality,
                        moon: service.moon
                    )
                    .gridCellFilling()
                }
            }
        }
    }

    private var dinRuteSection: some View {
        VStack(alignment: .leading, spacing: 18) {
            sectionHeader(title: "Din rute", english: "Your route", count: 2)
            Grid(alignment: .topLeading,
                 horizontalSpacing: UltronTheme.Spacing.gridGap,
                 verticalSpacing: UltronTheme.Spacing.gridGap) {
                GridRow {
                    UltronHjemRuteTile(
                        commute: service.commute,
                        chargers: service.chargers,
                        destinationWeather: service.destinationWeather,
                        lastRefresh: service.lastRefresh
                    )
                    .gridCellFilling()
                    UltronTrafikInfoTile(
                        events: service.trafficEvents,
                        totalCount: service.trafficEventsTotalCount,
                        countByCategory: service.trafficEventsCountByCategory,
                        lastRefresh: service.lastRefresh
                    )
                    .gridCellFilling()
                }
            }
        }
    }

    private var overOgOmkringSection: some View {
        VStack(alignment: .leading, spacing: 18) {
            sectionHeader(title: "Over & omkring", english: "Overhead & around", count: 2)
            Grid(alignment: .topLeading,
                 horizontalSpacing: UltronTheme.Spacing.gridGap,
                 verticalSpacing: UltronTheme.Spacing.gridGap) {
                GridRow {
                    UltronFlyTile(
                        aircraft: service.aircraftNearby,
                        lastRefresh: service.lastRefresh
                    )
                    .gridCellFilling()
                    UltronNyhederTile(newsBySource: service.newsBySource)
                        .gridCellFilling()
                }
            }
        }
    }

    private var dinMaskineSection: some View {
        VStack(alignment: .leading, spacing: 18) {
            sectionHeader(title: "Din maskine", english: "Your machine", count: 3)
            Grid(alignment: .topLeading,
                 horizontalSpacing: UltronTheme.Spacing.gridGap,
                 verticalSpacing: UltronTheme.Spacing.gridGap) {
                GridRow {
                    UltronSystemTile(system: service.systemInfo)
                        .gridCellFilling()
                    UltronNetvaerkTile(system: service.systemInfo)
                        .gridCellFilling()
                    UltronClaudeCodeTile(stats: service.claudeStats)
                        .gridCellFilling()
                }
            }
        }
    }

    // MARK: - Section header

    private func sectionHeader(title: String, english: String, count: Int) -> some View {
        HStack(alignment: .lastTextBaseline, spacing: 14) {
            Text(title)
                .font(UltronTheme.Typography.sectionH2())
                .foregroundStyle(UltronTheme.text)
            Text(english)
                .font(UltronTheme.Typography.tileSubhead())
                .tracking(1.26)
                .textCase(.uppercase)
                .foregroundStyle(UltronTheme.textFaint)
            Rectangle()
                .fill(UltronTheme.lineSoft)
                .frame(height: 1)
                .frame(maxWidth: .infinity)
            Text(String(format: "%02d felter", count))
                .font(UltronTheme.Typography.kicker())
                .tracking(2.1)
                .textCase(.uppercase)
                .foregroundStyle(UltronTheme.textFaint)
        }
    }

    // MARK: - Header copy

    /// "COCKPIT · MANDAGSBRIEFING" — weekday-aware mono kicker.
    private var kickerText: String {
        let df = DateFormatter()
        df.locale = Locale(identifier: "da_DK")
        df.dateFormat = "EEEE"
        let weekday = df.string(from: Date()).uppercased()
        return "COCKPIT · \(weekday)SBRIEFING"
    }

    /// First greeting line — shortened so the italic continuation
    /// reads as part of the same sentence.
    private var heroLine: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<10:   return "God morgen."
        case 10..<12:  return "God formiddag."
        case 12..<17:  return "God eftermiddag."
        case 17..<21:  return "God aften."
        default:       return "Nat."
        }
    }

    /// Italic continuation — context-aware follow-up line under the
    /// hero, styled like the handoff's pull-quote serif.
    private var heroItalic: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<10:   return "Dagen er klar — kaffen er sort."
        case 10..<12:  return "Rolige linjer, skarpe beslutninger."
        case 12..<17:  return "Du er hjemme før det bliver mørkt, lige netop."
        case 17..<21:  return "Roen lander snart. Lad skærmen dæmpe sig."
        default:       return "Skærmen er dæmpet. Kig let, tal sagte."
        }
    }

    /// "København · 55.676° N · Mandag, 20. April · 21:07 CET · Sunset 19:28"
    private func metaLine() -> String {
        var parts: [String] = []

        // Location — use the weather snapshot's label when available
        // (reverse-geocoded from LocationService), else fall back to
        // coordinate-only.
        if let label = service.weather?.locationLabel, !label.isEmpty {
            parts.append(label)
        }
        if let coord = service.userCoordinate {
            parts.append(String(format: "%.3f° N", coord.latitude))
        }

        let dateDF = DateFormatter()
        dateDF.locale = Locale(identifier: "da_DK")
        dateDF.dateFormat = "EEEE, d. MMMM"
        parts.append(dateDF.string(from: Date()).capitalized)

        let timeDF = DateFormatter()
        timeDF.dateFormat = "HH:mm"
        parts.append("\(timeDF.string(from: Date())) CET")

        if let sunset = service.weather?.daily.first?.sunset {
            parts.append("Sunset \(timeDF.string(from: sunset))")
        }

        return parts.joined(separator: " · ")
    }
}

// MARK: - Grid cell helper

private extension View {
    /// Make a tile stretch to fill the row height its `Grid`-sibling sets,
    /// and take its column's full width. Without this, `Grid` items keep
    /// their intrinsic size and tiles in the same row end up uneven.
    func gridCellFilling() -> some View {
        frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
