import Foundation

/// Proactive morning briefing — "Godmorgen, Sir. Dit første møde er kl. 09:15 …"
///
/// Checks once per minute whether the user's configured briefing time has
/// passed and the last run was not today. If so, builds a short plain-text
/// summary from the existing Weather / Calendar / News services and hands it
/// off to `TTSService` so Skynet speaks it aloud.
///
/// Nothing here talks to Gemini directly — the briefing is a deterministic
/// template so it works with zero API cost. If the user wants a more natural
/// morning call the same text can be piped into Live Voice later.
@MainActor
final class MorningBriefingService {
    private let locationService: LocationService
    private let weatherService: WeatherService
    private let updatesService: UpdatesService
    private let tts: TTSService
    private let calendarService: CalendarService

    private var timer: Timer?

    /// Injectable so a future UI can show the last-generated text, re-speak it,
    /// or open a dedicated Briefing HUD. Fires on main actor after every run.
    var onBriefing: ((String) -> Void)?

    init(
        locationService: LocationService,
        updatesService: UpdatesService,
        tts: TTSService,
        weatherService: WeatherService? = nil,
        calendarService: CalendarService? = nil
    ) {
        self.locationService = locationService
        self.updatesService = updatesService
        self.tts = tts
        // Defaults konstrueres herinde — init er @MainActor, så det er OK at
        // kalde main-actor-isolerede initializere herfra. (Inline-defaults i
        // parameter-listen evalueres i nonisolated-kontekst og fejler i Swift 6.)
        self.weatherService = weatherService ?? WeatherService()
        self.calendarService = calendarService ?? CalendarService()
    }

    // MARK: - Scheduler

    /// Start the poll loop. Safe to call multiple times — re-arms the timer.
    func start() {
        stop()
        let t = Timer(timeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.tick() }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
        LoggingService.shared.log("Morning briefing scheduler armed")
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    /// Manual trigger — bypasses the scheduled time so users can hear the
    /// briefing on demand from Settings or a menu-bar item.
    func runNow() async {
        await buildAndSpeak()
    }

    // MARK: - Tick

    private func tick() async {
        guard UserDefaults.standard.bool(forKey: Constants.Defaults.morningBriefingEnabled) else { return }
        guard isPastScheduledTime(), !alreadyRanToday() else { return }
        UserDefaults.standard.set(Self.today(), forKey: Constants.Defaults.morningBriefingLastRun)
        await buildAndSpeak()
    }

    private func isPastScheduledTime() -> Bool {
        let configured = UserDefaults.standard.string(forKey: Constants.Defaults.morningBriefingTime) ?? "07:30"
        let parts = configured.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return false }

        let cal = Calendar.current
        var comps = cal.dateComponents([.year, .month, .day], from: Date())
        comps.hour = parts[0]
        comps.minute = parts[1]
        guard let scheduled = cal.date(from: comps) else { return false }
        return Date() >= scheduled
    }

    private func alreadyRanToday() -> Bool {
        let last = UserDefaults.standard.string(forKey: Constants.Defaults.morningBriefingLastRun) ?? ""
        return last == Self.today()
    }

    private static func today() -> String {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        return df.string(from: Date())
    }

    // MARK: - Composition

    private func buildAndSpeak() async {
        let text = await composeBriefing()
        onBriefing?(text)
        LoggingService.shared.log("Morning briefing: \(text.prefix(120))")
        tts.speakAlways(text)
    }

    private func composeBriefing() async -> String {
        let greeting = personalisedGreeting()
        let weatherLine = await weatherLineIfAvailable()
        let calendarLine = await calendarLineIfAvailable()
        let newsLine = await newsLineIfAvailable()

        let lines = [greeting, weatherLine, calendarLine, newsLine]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
        return lines.joined(separator: " ")
    }

    private func personalisedGreeting() -> String {
        let address = UserDefaults.standard.string(forKey: Constants.Defaults.personaAddress) ?? "Sir"
        let trimmed = address.trimmingCharacters(in: .whitespacesAndNewlines)
        let name = trimmed.isEmpty ? "Sir" : trimmed
        return "Godmorgen, \(name)."
    }

    private func weatherLineIfAvailable() async -> String? {
        guard let location = await locationService.refreshWithCity() else { return nil }
        let (coord, label) = location
        guard let snapshot = try? await weatherService.fetch(for: coord, locationLabel: label) else {
            return nil
        }
        let temp = Int(snapshot.current.temperature.rounded())
        if let today = snapshot.daily.first {
            let min = Int(today.tempMin.rounded())
            let max = Int(today.tempMax.rounded())
            let precip = today.precipitationProbability ?? 0
            let rainTail = precip > 40 ? " Medbring jakke — \(precip) procent chance for nedbør." : ""
            return "Vejret i \(label) lige nu er \(temp) grader, i dag mellem \(min) og \(max) grader.\(rainTail)"
        }
        return "Vejret i \(label) lige nu er \(temp) grader."
    }

    private func calendarLineIfAvailable() async -> String? {
        guard let event = await calendarService.nextEvent() else {
            return "Ingen kommende møder i kalenderen."
        }
        let df = DateFormatter()
        df.locale = Locale(identifier: "da_DK")
        let cal = Calendar(identifier: .gregorian)
        df.dateFormat = cal.isDateInToday(event.start) ? "HH:mm" : "d. MMM HH:mm"
        return "Næste møde: \(df.string(from: event.start)) \(event.title)."
    }

    private func newsLineIfAvailable() async -> String? {
        await updatesService.refresh(force: false)
        let all = updatesService.news.values.flatMap { $0 }
        guard !all.isEmpty else { return nil }
        let top = all.prefix(3).map { $0.title }
        return "Top-nyheder: " + top.joined(separator: "; ") + "."
    }
}
