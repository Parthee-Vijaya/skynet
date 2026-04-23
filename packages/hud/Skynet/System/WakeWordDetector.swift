import Foundation

/// What the wake word should trigger when it fires.
/// Stored as the raw string in UserDefaults (`Constants.Defaults.wakeWordAction`).
enum WakeWordAction: String, CaseIterable, Identifiable {
    /// Legacy behaviour: one-shot voice Q&A with the HUD.
    case qna
    /// Open / focus the chat window and start a dictation into it.
    case chat
    /// Start a bidirectional Gemini Live Audio session (costs more, opt-in).
    case liveVoice

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .qna:       return "Stil et spørgsmål (Q&A)"
        case .chat:      return "Åbn chat og dikter"
        case .liveVoice: return "Live-samtale (Gemini Live)"
        }
    }

    var footnote: String {
        switch self {
        case .qna:       return "Klassisk: én sætning, svar i HUD."
        case .chat:      return "Transskriberer dig ind i chat-vinduet."
        case .liveVoice: return "Bidirektionel stemme. Koster mere end Flash — kræver Live Voice slået til i Settings."
        }
    }
}

/// Abstract wake-word listener. Concrete implementation in `PorcupineWakeWordDetector`.
/// The protocol lets us swap engines later (e.g. openWakeWord) without touching callers.
protocol WakeWordDetecting: AnyObject {
    /// Begin listening. The handler fires on the main actor when the wake word is heard.
    func start(onWake: @escaping @MainActor () -> Void) throws
    /// Stop listening and release the audio tap.
    func stop()
    /// True while actively consuming mic frames.
    var isRunning: Bool { get }
}

/// Errors returned from wake-word detection setup.
enum WakeWordError: LocalizedError {
    case porcupineNotIntegrated
    case missingAccessKey
    case audioEngineFailed(underlying: Error)
    case initializationFailed(underlying: Error)

    var errorDescription: String? {
        switch self {
        case .porcupineNotIntegrated:
            return "Porcupine SPM-pakken er ikke tilføjet til projektet endnu. Tilføj 'https://github.com/Picovoice/porcupine' via Xcode → File → Add Package Dependencies, og vælg Porcupine-produktet."
        case .missingAccessKey:
            return "Tilføj din Picovoice AccessKey i Settings → Wake Word. Hent en gratis nøgle på https://picovoice.ai/console/"
        case .audioEngineFailed(let error):
            return "Mikrofon-tap fejlede: \(error.localizedDescription)"
        case .initializationFailed(let error):
            return "Kunne ikke starte wake word detector: \(error.localizedDescription)"
        }
    }
}
