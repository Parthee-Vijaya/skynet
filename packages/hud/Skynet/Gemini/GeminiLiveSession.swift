import AVFoundation
import Foundation

/// Bidirectional Gemini Live Audio session.
///
/// Wraps a `URLSessionWebSocketTask` talking to Google's Live API
/// (`BidiGenerateContent`). The session streams 16-bit PCM mic audio to the
/// server and receives both interim transcripts and raw PCM reply audio it
/// plays through the system output.
///
/// The WebSocket protocol shape is documented at
/// <https://ai.google.dev/api/live>. This implementation is intentionally
/// minimal — it covers:
///   - setup with a system instruction
///   - PCM uplink frames (realtimeInput.audio)
///   - PCM downlink frames (serverContent.modelTurn)
///   - text transcript mirroring (serverContent.outputTranscription)
///   - turnComplete signalling for graceful hang-up
///
/// Because Live costs substantially more than Flash, callers must gate entry
/// behind the `liveVoiceEnabled` UserDefault. See `LiveVoiceService` for the
/// wire-up.
@MainActor
final class GeminiLiveSession {
    enum SessionError: LocalizedError {
        case missingAPIKey
        case connectionFailed(underlying: Error)
        case encodingFailed
        case serverError(message: String)

        var errorDescription: String? {
            switch self {
            case .missingAPIKey:
                return "Gemini API-nøgle mangler. Tilføj den i Settings → API-nøgler."
            case .connectionFailed(let err):
                return "Live-forbindelse fejlede: \(err.localizedDescription)"
            case .encodingFailed:
                return "Kunne ikke kode Live-besked til JSON."
            case .serverError(let msg):
                return "Live-server fejl: \(msg)"
            }
        }
    }

    enum Event {
        /// Partial model text (transcript of Gemini's voice, if enabled).
        case assistantTextDelta(String)
        /// A chunk of PCM16 audio from the model. Sample rate = 24 kHz (Live default).
        case assistantAudio(Data)
        /// The model finished its current turn.
        case turnComplete
        /// Connection closed (either end). Treat as terminal.
        case closed(Error?)
    }

    // MARK: - Config

    private let keychain: KeychainService
    private let model: String
    private let systemInstruction: String?
    private let session: URLSession

    // MARK: - Internal state

    private var task: URLSessionWebSocketTask?
    private var isSetup = false
    private var receiveLoop: Task<Void, Never>?
    private var eventContinuation: AsyncStream<Event>.Continuation?

    init(
        keychain: KeychainService,
        model: String = Constants.LiveVoice.defaultModel,
        systemInstruction: String?
    ) {
        self.keychain = keychain
        self.model = model
        self.systemInstruction = systemInstruction

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 600
        self.session = URLSession(configuration: config)
    }

    // MARK: - Public API

    /// Open the WebSocket, send the setup frame, and return an async stream of
    /// events. Caller is responsible for awaiting the stream and calling
    /// `finish()` when the user's turn is over.
    func connect() throws -> AsyncStream<Event> {
        guard let apiKey = keychain.getAPIKey() else {
            throw SessionError.missingAPIKey
        }

        var components = URLComponents(string: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent")!
        components.queryItems = [URLQueryItem(name: "key", value: apiKey)]
        guard let url = components.url else {
            throw SessionError.connectionFailed(underlying: URLError(.badURL))
        }

        var request = URLRequest(url: url)
        request.setValue("Skynet-macOS/\(Constants.appVersion)", forHTTPHeaderField: "User-Agent")

        let task = session.webSocketTask(with: request)
        self.task = task
        task.resume()

        let stream = AsyncStream<Event> { continuation in
            eventContinuation = continuation
            continuation.onTermination = { @Sendable _ in
                Task { @MainActor [weak self] in self?.finishInternal() }
            }
        }

        Task { await self.sendSetup() }
        startReceiveLoop()
        return stream
    }

    /// Pipe a PCM16 / 16 kHz / mono buffer upstream. Call repeatedly on every
    /// mic frame; the Live server accepts small chunks (~40 ms).
    func sendAudio(_ pcm: Data) {
        guard let task, isSetup else { return }
        let body: [String: Any] = [
            "realtimeInput": [
                "audio": [
                    "mimeType": "audio/pcm;rate=\(Constants.LiveVoice.sampleRate)",
                    "data": pcm.base64EncodedString()
                ]
            ]
        ]
        sendJSON(body, via: task)
    }

    /// Tell the server "the user finished their sentence — please respond".
    /// Without this the model waits in case more audio arrives.
    func completeTurn() {
        guard let task, isSetup else { return }
        let body: [String: Any] = [
            "realtimeInput": ["audioStreamEnd": true]
        ]
        sendJSON(body, via: task)
    }

    /// Close the connection. Safe to call multiple times.
    func finish() {
        finishInternal()
    }

    // MARK: - Internals

    private func finishInternal() {
        receiveLoop?.cancel()
        receiveLoop = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        isSetup = false
        eventContinuation?.yield(.closed(nil))
        eventContinuation?.finish()
        eventContinuation = nil
    }

    private func sendSetup() async {
        guard let task else { return }
        var setup: [String: Any] = [
            "setup": [
                "model": "models/\(model)",
                "generationConfig": [
                    "responseModalities": ["AUDIO"],
                    "speechConfig": [
                        "voiceConfig": [
                            "prebuiltVoiceConfig": ["voiceName": "Aoede"]
                        ]
                    ]
                ],
                "outputAudioTranscription": [:]
            ]
        ]
        if let systemInstruction, !systemInstruction.isEmpty {
            var inner = setup["setup"] as? [String: Any] ?? [:]
            inner["systemInstruction"] = [
                "parts": [["text": systemInstruction]]
            ]
            setup["setup"] = inner
        }
        sendJSON(setup, via: task)
    }

    private func sendJSON(_ dict: [String: Any], via task: URLSessionWebSocketTask) {
        do {
            let data = try JSONSerialization.data(withJSONObject: dict, options: [])
            guard let text = String(data: data, encoding: .utf8) else { return }
            task.send(.string(text)) { error in
                if let error {
                    LoggingService.shared.log("Live send error: \(error.localizedDescription)", level: .warning)
                }
            }
        } catch {
            LoggingService.shared.log("Live JSON encode failed: \(error)", level: .warning)
        }
    }

    private func startReceiveLoop() {
        receiveLoop = Task { [weak self] in
            while !Task.isCancelled {
                guard let self, let task = self.task else { break }
                do {
                    let message = try await task.receive()
                    self.handle(message: message)
                } catch {
                    self.eventContinuation?.yield(.closed(error))
                    self.eventContinuation?.finish()
                    self.eventContinuation = nil
                    break
                }
            }
        }
    }

    private func handle(message: URLSessionWebSocketTask.Message) {
        let data: Data
        switch message {
        case .data(let d): data = d
        case .string(let s): data = s.data(using: .utf8) ?? Data()
        @unknown default: return
        }
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        if root["setupComplete"] != nil {
            isSetup = true
            LoggingService.shared.log("Gemini Live: setup complete")
            return
        }

        if let server = root["serverContent"] as? [String: Any] {
            if let modelTurn = server["modelTurn"] as? [String: Any],
               let parts = modelTurn["parts"] as? [[String: Any]] {
                for part in parts {
                    if let inline = part["inlineData"] as? [String: Any],
                       let base64 = inline["data"] as? String,
                       let audio = Data(base64Encoded: base64) {
                        eventContinuation?.yield(.assistantAudio(audio))
                    }
                    if let text = part["text"] as? String, !text.isEmpty {
                        eventContinuation?.yield(.assistantTextDelta(text))
                    }
                }
            }
            if let transcript = server["outputTranscription"] as? [String: Any],
               let text = transcript["text"] as? String, !text.isEmpty {
                eventContinuation?.yield(.assistantTextDelta(text))
            }
            if (server["turnComplete"] as? Bool) == true {
                eventContinuation?.yield(.turnComplete)
            }
        }

        if let err = root["error"] as? [String: Any],
           let message = err["message"] as? String {
            LoggingService.shared.log("Gemini Live error: \(message)", level: .error)
            eventContinuation?.yield(.closed(SessionError.serverError(message: message)))
            eventContinuation?.finish()
            eventContinuation = nil
        }
    }
}
