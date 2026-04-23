import AVFoundation
import Foundation

/// Hosts a single Skynet ↔ Gemini Live conversation turn.
///
/// Responsibilities:
/// 1. Subscribe to `SharedAudioEngine` and resample incoming buffers to the
///    16 kHz PCM16 Live expects.
/// 2. Forward every frame to the underlying `GeminiLiveSession`.
/// 3. Buffer the server-side PCM reply into an `AVAudioPlayerNode` so Skynet
///    actually talks out of the speakers.
/// 4. Expose a simple stop() so wake-word callers or barge-in can abort.
///
/// Entry is gated via `liveVoiceEnabled` UserDefault. Callers also read
/// `canStart` before invoking so they can fall back to push-to-talk when
/// either the toggle is off or the API key is missing.
@MainActor
final class LiveVoiceService {
    private let keychain: KeychainService
    private let persona: PersonaService
    private var session: GeminiLiveSession?

    private var subscriberToken: UUID?
    private var converter: AVAudioConverter?
    private var uplinkFormat: AVAudioFormat?

    private let playerEngine = AVAudioEngine()
    private let playerNode = AVAudioPlayerNode()
    private var playerFormat: AVAudioFormat?
    private var playerPrepared = false

    private(set) var isRunning = false
    private var streamTask: Task<Void, Never>?

    var onTranscriptDelta: ((String) -> Void)?
    var onStopped: (() -> Void)?

    init(keychain: KeychainService, persona: PersonaService) {
        self.keychain = keychain
        self.persona = persona
    }

    /// True when all preconditions for a Live session are met.
    var canStart: Bool {
        guard UserDefaults.standard.bool(forKey: Constants.Defaults.liveVoiceEnabled) else { return false }
        return keychain.getAPIKey() != nil
    }

    // MARK: - Start / stop

    func start() {
        guard !isRunning else { return }
        guard canStart else {
            LoggingService.shared.log("Live voice: canStart == false, ignoring", level: .warning)
            return
        }

        let modelName = UserDefaults.standard.string(forKey: Constants.Defaults.liveVoiceModel)
            ?? Constants.LiveVoice.defaultModel
        let systemInstruction = persona.augment(systemPrompt: BuiltInModes.chat.systemPrompt)
        let session = GeminiLiveSession(
            keychain: keychain,
            model: modelName,
            systemInstruction: systemInstruction
        )
        self.session = session

        do {
            preparePlayer()
            let stream = try session.connect()
            try attachMicrophone()
            isRunning = true
            LoggingService.shared.log("Live voice: session started (model=\(modelName))")

            streamTask = Task { [weak self] in
                for await event in stream {
                    guard let self else { break }
                    self.handle(event: event)
                }
                self?.finishLocal()
            }
        } catch {
            LoggingService.shared.log("Live voice start failed: \(error.localizedDescription)", level: .error)
            session.finish()
            self.session = nil
            finishLocal()
        }
    }

    func stop() {
        guard isRunning || session != nil else { return }
        session?.completeTurn()
        finishLocal()
    }

    // MARK: - Audio uplink

    private func attachMicrophone() throws {
        let engine = SharedAudioEngine.shared
        try engine.start()

        guard let hwFormat = engine.inputFormat else { return }
        let target = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: Double(Constants.LiveVoice.sampleRate),
            channels: 1,
            interleaved: true
        )
        uplinkFormat = target
        if let target {
            converter = AVAudioConverter(from: hwFormat, to: target)
        }

        subscriberToken = engine.addSubscriber { [weak self] buffer in
            Task { @MainActor [weak self] in
                self?.forwardBuffer(buffer)
            }
        }
    }

    private func forwardBuffer(_ buffer: AVAudioPCMBuffer) {
        guard let converter, let target = uplinkFormat, let session else { return }

        let ratio = target.sampleRate / buffer.format.sampleRate
        let outCapacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 64
        guard let converted = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: outCapacity) else { return }

        var provided = false
        var err: NSError?
        converter.convert(to: converted, error: &err) { _, status in
            status.pointee = provided ? .noDataNow : .haveData
            provided = true
            return buffer
        }
        if err != nil { return }

        guard let channel = converted.int16ChannelData?[0] else { return }
        let byteCount = Int(converted.frameLength) * MemoryLayout<Int16>.size
        let data = Data(bytes: channel, count: byteCount)
        session.sendAudio(data)
    }

    // MARK: - Audio downlink

    private func preparePlayer() {
        guard !playerPrepared else { return }
        let format = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: 24_000,
            channels: 1,
            interleaved: true
        )
        playerFormat = format
        playerEngine.attach(playerNode)
        if let format {
            playerEngine.connect(playerNode, to: playerEngine.mainMixerNode, format: format)
        }
        do {
            try playerEngine.start()
            playerNode.play()
            playerPrepared = true
        } catch {
            LoggingService.shared.log("Live voice player start failed: \(error)", level: .warning)
        }
    }

    private func playPCM(_ data: Data) {
        guard let format = playerFormat, playerPrepared else { return }
        let frameCount = UInt32(data.count / MemoryLayout<Int16>.size)
        guard frameCount > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { return }
        buffer.frameLength = frameCount
        guard let channel = buffer.int16ChannelData?[0] else { return }
        data.withUnsafeBytes { raw in
            guard let base = raw.bindMemory(to: Int16.self).baseAddress else { return }
            channel.update(from: base, count: Int(frameCount))
        }
        playerNode.scheduleBuffer(buffer, completionHandler: nil)
    }

    // MARK: - Event handling

    private func handle(event: GeminiLiveSession.Event) {
        switch event {
        case .assistantTextDelta(let text):
            onTranscriptDelta?(text)
        case .assistantAudio(let audio):
            playPCM(audio)
        case .turnComplete:
            LoggingService.shared.log("Live voice: turn complete")
        case .closed(let error):
            if let error {
                LoggingService.shared.log("Live voice closed with error: \(error.localizedDescription)", level: .warning)
            }
            finishLocal()
        }
    }

    private func finishLocal() {
        streamTask?.cancel()
        streamTask = nil
        session?.finish()
        session = nil

        if let token = subscriberToken {
            SharedAudioEngine.shared.removeSubscriber(token)
            subscriberToken = nil
        }
        SharedAudioEngine.shared.stopIfIdle()

        if playerPrepared {
            playerNode.stop()
            playerEngine.stop()
            playerPrepared = false
        }

        if isRunning {
            isRunning = false
            onStopped?()
        }
    }
}
