import Foundation
import Observation

@MainActor
@Observable
class UsageTracker {
    struct MonthlyUsage: Codable {
        var month: String
        var flashInputTokens: Int = 0
        var flashOutputTokens: Int = 0
        var proInputTokens: Int = 0
        var proOutputTokens: Int = 0
        var totalCostUSD: Double = 0.0
    }

    private static let flashInputPrice = 0.075
    private static let flashOutputPrice = 0.30
    private static let proInputPrice = 1.25
    private static let proOutputPrice = 5.00

    var currentUsage: MonthlyUsage
    var onCostWarning: ((Double) -> Void)?

    // MARK: - Live per-turn stats (for Ultron Chat / Voice HUD)

    /// Pretty name of the model used on the most-recent completed turn
    /// (e.g. "gemini-2.5-flash", "claude-sonnet-4-6"). Nil if no turn
    /// has completed in this session yet.
    var lastModelName: String?
    var lastInputTokens: Int = 0
    var lastOutputTokens: Int = 0
    /// Wall-clock duration between `beginTurn()` and the latest
    /// `trackUsage` call, in milliseconds. Zero if no turn has started.
    var lastLatencyMs: Int = 0
    /// Timestamp of the latest completed turn — callers use it to
    /// render "for 12s siden" in the Chat / Voice header.
    var lastTurnAt: Date?
    /// True between `beginTurn()` and `trackUsage`; Ultron HUDs can
    /// render a pulsing indicator while a request is in flight.
    var isTurnInFlight: Bool = false

    private var turnStart: Date?

    /// Stamps the start of a model round-trip. Called from the client
    /// right before the HTTP request / SSE stream opens so the latency
    /// is real wall-clock time (network + server + decode).
    func beginTurn() {
        turnStart = Date()
        isTurnInFlight = true
    }

    /// Record per-turn stats with the display-friendly model name.
    /// Call this even when `inputTokens`/`outputTokens` are already
    /// routed through `trackUsage(model:...)` so the Ultron HUDs see
    /// the Gemini AND Anthropic paths.
    func recordTurn(modelName: String, inputTokens: Int, outputTokens: Int) {
        lastModelName = modelName
        lastInputTokens = inputTokens
        lastOutputTokens = outputTokens
        if let start = turnStart {
            lastLatencyMs = Int(Date().timeIntervalSince(start) * 1000)
        }
        lastTurnAt = Date()
        isTurnInFlight = false
        turnStart = nil
    }

    var formattedUsage: String {
        "Usage: $\(String(format: "%.2f", currentUsage.totalCostUSD)) this month"
    }

    private let storageURL: URL
    private var lastWarnedThresholdUSD: Double = 0
    private static let warningThresholdsUSD: [Double] = [1.0, 5.0, 10.0, 25.0, 50.0, 100.0]

    init() {
        let appSupport = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Skynet")
        try? FileManager.default.createDirectory(at: appSupport, withIntermediateDirectories: true)
        storageURL = appSupport.appendingPathComponent("usage.json")
        currentUsage = MonthlyUsage(month: Self.currentMonth())
        loadUsage()
    }

    func trackUsage(model: GeminiModel, inputTokens: Int, outputTokens: Int) {
        checkMonthReset()
        switch model {
        case .flash:
            currentUsage.flashInputTokens += inputTokens
            currentUsage.flashOutputTokens += outputTokens
        case .pro:
            currentUsage.proInputTokens += inputTokens
            currentUsage.proOutputTokens += outputTokens
        }
        recalculateCost()
        saveUsage()
        checkCostWarning()
    }

    private func recalculateCost() {
        let flashInput = Double(currentUsage.flashInputTokens) / 1_000_000.0 * Self.flashInputPrice
        let flashOutput = Double(currentUsage.flashOutputTokens) / 1_000_000.0 * Self.flashOutputPrice
        let proInput = Double(currentUsage.proInputTokens) / 1_000_000.0 * Self.proInputPrice
        let proOutput = Double(currentUsage.proOutputTokens) / 1_000_000.0 * Self.proOutputPrice
        currentUsage.totalCostUSD = flashInput + flashOutput + proInput + proOutput
    }

    private func checkCostWarning() {
        // Fire the warning once per tier crossed — $1, $5, $10, $25, $50, $100.
        // Lower threshold (Constants.costWarningThresholdUSD) is the floor; ignore tiers below it.
        let cost = currentUsage.totalCostUSD
        guard let nextTier = Self.warningThresholdsUSD.first(where: {
            $0 >= Constants.costWarningThresholdUSD && cost >= $0 && lastWarnedThresholdUSD < $0
        }) else { return }
        lastWarnedThresholdUSD = nextTier
        LoggingService.shared.log("Cost warning: monthly usage reached $\(String(format: "%.2f", cost)) (tier $\(nextTier))", level: .warning)
        onCostWarning?(cost)
    }

    private func checkMonthReset() {
        let now = Self.currentMonth()
        if currentUsage.month != now {
            currentUsage = MonthlyUsage(month: now)
            lastWarnedThresholdUSD = 0
            saveUsage()
            LoggingService.shared.log("Usage tracker reset for new month: \(now)")
        }
    }

    private func loadUsage() {
        guard let data = try? Data(contentsOf: storageURL),
              let usage = try? JSONDecoder().decode(MonthlyUsage.self, from: data) else { return }
        if usage.month == Self.currentMonth() {
            currentUsage = usage
        }
    }

    private func saveUsage() {
        guard let data = try? JSONEncoder().encode(currentUsage) else { return }
        try? data.write(to: storageURL)
    }

    private static func currentMonth() -> String {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM"
        return df.string(from: Date())
    }
}
