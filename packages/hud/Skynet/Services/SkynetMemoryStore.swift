import Foundation

/// A single remembered fact the persona layer can quote back to the user.
struct SkynetMemoryFact: Codable, Identifiable, Equatable {
    let id: UUID
    var key: String
    var value: String
    var createdAt: Date

    init(id: UUID = UUID(), key: String, value: String, createdAt: Date = Date()) {
        self.id = id
        self.key = key
        self.value = value
        self.createdAt = createdAt
    }
}

/// Durable "Skynet knows me" store. Persists short user facts to a JSON file in
/// Application Support so the persona preamble can remind the model of them on
/// every Chat/Q&A turn.
///
/// Deliberately tiny: no vector store, no embeddings — just a flat list of
/// `key → value` facts the user curates. Injection into prompts is opt-in
/// behind the `memoryInjectionEnabled` toggle so users who prefer a blank
/// Skynet can turn it off.
@MainActor
final class SkynetMemoryStore {
    /// Maximum number of facts stored on disk. Keeps prompt overhead bounded
    /// even if the user adds dozens — oldest items fall off first.
    static let maxFacts = 40

    private let url: URL
    private(set) var facts: [SkynetMemoryFact] = []

    init() {
        let fm = FileManager.default
        let base = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        let dir = base.appendingPathComponent(Constants.appName, isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        self.url = dir.appendingPathComponent("memory.json")
        load()
    }

    // MARK: - Public API

    func all() -> [SkynetMemoryFact] { facts }

    @discardableResult
    func add(key: String, value: String) -> SkynetMemoryFact {
        let trimmedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let fact = SkynetMemoryFact(key: trimmedKey, value: trimmedValue)
        facts.append(fact)
        enforceLimit()
        persist()
        return fact
    }

    func update(id: UUID, key: String, value: String) {
        guard let index = facts.firstIndex(where: { $0.id == id }) else { return }
        facts[index].key = key.trimmingCharacters(in: .whitespacesAndNewlines)
        facts[index].value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        persist()
    }

    func remove(id: UUID) {
        facts.removeAll { $0.id == id }
        persist()
    }

    func removeAll() {
        facts.removeAll()
        persist()
    }

    // MARK: - Persistence

    private func load() {
        guard let data = try? Data(contentsOf: url) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        if let decoded = try? decoder.decode([SkynetMemoryFact].self, from: data) {
            self.facts = decoded
        }
    }

    private func persist() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(facts) else { return }
        try? data.write(to: url, options: [.atomic])
    }

    private func enforceLimit() {
        if facts.count > Self.maxFacts {
            facts.removeFirst(facts.count - Self.maxFacts)
        }
    }
}
