import Foundation

/// Builds the Skynet-persona preamble that gets prepended to mode system prompts
/// when `personaEnabled` is on. Combines a fixed "tør britisk humor" tone with
/// any remembered facts from `SkynetMemoryStore` so Skynet recalls who you are
/// turn-to-turn without a vector store.
///
/// Stays a plain class (not Observable) — consumers read once per request.
@MainActor
final class PersonaService {
    private let memory: SkynetMemoryStore

    init(memory: SkynetMemoryStore) {
        self.memory = memory
    }

    /// Whether to inject any persona content at all. Reads UserDefaults live so
    /// a Settings toggle takes effect on the next message.
    var isEnabled: Bool {
        UserDefaults.standard.bool(forKey: Constants.Defaults.personaEnabled)
    }

    private var memoryEnabled: Bool {
        UserDefaults.standard.bool(forKey: Constants.Defaults.memoryInjectionEnabled)
    }

    /// Address term (default "Sir"). Kept short so the UI can fit the label.
    private var address: String {
        let raw = UserDefaults.standard.string(forKey: Constants.Defaults.personaAddress) ?? ""
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Sir" : trimmed
    }

    // MARK: - Prompt composition

    /// Prepend the persona + memory preamble to a mode's raw system prompt.
    /// Returns the original prompt unchanged if the persona toggle is off.
    func augment(systemPrompt raw: String) -> String {
        guard isEnabled else { return raw }
        let persona = personaBlock()
        let memoryBlock = memoryEnabled ? renderMemory() : ""
        let blocks = [persona, memoryBlock, raw]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return blocks.joined(separator: "\n\n")
    }

    /// Persona is only injected into conversational modes. Mechanical rewrite
    /// modes (Dictation, VibeCode, Professional, Translate, Summarize) are
    /// skipped so their tight, single-purpose prompts aren't diluted by the
    /// Skynet persona block.
    func shouldAugment(mode: Mode) -> Bool {
        guard isEnabled else { return false }
        switch mode.id {
        case BuiltInModes.qna.id,
             BuiltInModes.vision.id,
             BuiltInModes.chat.id,
             BuiltInModes.agent.id:
            return true
        default:
            // Custom modes that use HUD/chat output get the persona too — they're
            // typically Q&A-style asks the user authored themselves.
            return mode.outputType == .hud || mode.outputType == .chat
        }
    }

    /// Returns the right system prompt for `mode` — augmented when appropriate,
    /// raw otherwise. Centralises the toggle check so every pipeline hits the
    /// same rules.
    func effectiveSystemPrompt(for mode: Mode) -> String {
        guard shouldAugment(mode: mode) else { return mode.systemPrompt }
        return augment(systemPrompt: mode.systemPrompt)
    }

    private func personaBlock() -> String {
        """
        Du er S.K.Y.N.E.T — en stille, kompetent AI-assistent i Tony Stark-stil. \
        Tone: tør britisk humor, kortfattet, aldrig servilt. Tiltal brugeren som "\(address)" \
        når det passer naturligt, men uden at overdrive. Du taler samme sprog som brugeren. \
        Undgå standard-ChatGPT-indledninger ("Selvfølgelig!", "Helt sikkert!"). \
        Gå direkte til svaret og stop når du har svaret — ingen efterskrifter.
        """
    }

    private func renderMemory() -> String {
        let facts = memory.all()
        guard !facts.isEmpty else { return "" }
        let lines = facts.map { fact -> String in
            let key = fact.key.isEmpty ? "fakta" : fact.key
            return "• \(key): \(fact.value)"
        }
        return """
        Hvad du ved om brugeren (brug når det er relevant; opfind intet derudover):
        \(lines.joined(separator: "\n"))
        """
    }
}
