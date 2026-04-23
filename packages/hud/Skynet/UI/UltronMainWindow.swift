import AVFoundation
import Combine
import Darwin
import SwiftUI

/// Unified Ultron window — three tabs (Cockpit / Stemme / Chat) share
/// one panel. Replaces the old separate InfoMode / Chat / HUD windows
/// when the `ultronRedesignEnabled` flag is on.
///
/// Keyboard:
/// - `1` / `2` / `3` → switch tab
/// - `?` (Shift-/) → hotkey cheat sheet (wired from parent)
///
/// State is persisted to `UserDefaults.standard` under the key
/// `ultron-screen` so the window opens on whichever tab was last active.
struct UltronMainWindow: View {
    @Bindable var infoService: InfoModeService
    let audioLevel: AudioLevelMonitor
    let waveform: WaveformBuffer
    @Bindable var hudState: HUDState
    @Bindable var speechService: SpeechRecognitionService
    @Bindable var usageTracker: UsageTracker
    let chatSession: ChatSession?
    let conversationHistory: [ConversationStore.Metadata]
    let currentConversationID: UUID?
    let onChatSend: (String) -> Void
    let onAgentApprove: () -> Void
    let onAgentReject: () -> Void
    let onLoadConversation: (UUID) -> Void
    let onDeleteConversation: (UUID) -> Void
    let onClose: () -> Void
    let onMinimize: () -> Void
    let onZoom: () -> Void
    let onOpenSettings: () -> Void

    @State private var activeTab: UltronTab = UltronMainWindow.restoreTab()
    @State private var showHotkeySheet: Bool = false
    @State private var isReloading: Bool = false

    var body: some View {
        ZStack {
            UltronTheme.rootBackground.ignoresSafeArea()

            VStack(spacing: 0) {
                UltronTopBar(
                    activeTab: $activeTab,
                    liveLabel: liveLabel,
                    livePulsing: livePulsing,
                    onHotkeySheet: { showHotkeySheet.toggle() },
                    onClose: onClose,
                    onMinimize: onMinimize,
                    onZoom: onZoom,
                    onReload: reload,
                    isReloading: isReloading,
                    onSettings: onOpenSettings
                )

                // Tab content — full-flex below the top bar
                Group {
                    switch activeTab {
                    case .cockpit:
                        UltronCockpitView(service: infoService, onClose: onClose)
                    case .voice:
                        UltronVoiceHost(
                            audioLevel: audioLevel,
                            waveform: waveform,
                            hudState: hudState,
                            speechService: speechService,
                            usageTracker: usageTracker,
                            onSendToChat: handoffVoiceToChat
                        )
                    case .chat:
                        UltronChatHost(
                            session: chatSession,
                            usageTracker: usageTracker,
                            conversationHistory: conversationHistory,
                            currentConversationID: currentConversationID,
                            onSend: onChatSend,
                            onApprove: onAgentApprove,
                            onReject: onAgentReject,
                            onLoadConversation: onLoadConversation,
                            onDeleteConversation: onDeleteConversation
                        )
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .transition(.opacity)
                .id(activeTab)                     // force state reset per tab
            }
        }
        .frame(minWidth: 1100, minHeight: 760)
        .foregroundStyle(UltronTheme.text)
        .overlay(hotkeySheetOverlay)
        .background(KeyShortcutBinder(
            onTab: { activeTab = $0 },
            onEscape: { showHotkeySheet = false },
            onQuestion: { showHotkeySheet.toggle() }
        ))
        .onChange(of: activeTab) { _, new in
            UserDefaults.standard.set(new.rawValue, forKey: UltronMainWindow.screenKey)
        }
        // Live tab switching — `HUDWindowController.showChat` /
        // `showUptodate` posts this notification so an already-mounted
        // window flips tab without waiting on the next `restoreTab()`.
        .onReceive(NotificationCenter.default.publisher(
            for: HUDWindowController.ultronSwitchTabNotification
        )) { note in
            if let raw = note.userInfo?["tab"] as? String,
               let tab = UltronTab(rawValue: raw) {
                activeTab = tab
            }
        }
    }

    // MARK: - Voice → Chat handoff

    /// Push the given transcript into the active Chat session as a
    /// user message, fire the chat router, then switch to the Chat
    /// tab. Called from the "Send til chat" button on the Voice HUD.
    private func handoffVoiceToChat(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        onChatSend(trimmed)
        activeTab = .chat
        speechService.reset()
    }

    // MARK: - Reload

    /// Tab-aware reload: cockpit refreshes all data, voice resets the
    /// transcript / audio meters, chat clears the active session.
    private func reload() {
        guard !isReloading else { return }
        isReloading = true
        Task {
            switch activeTab {
            case .cockpit:
                await infoService.refresh(force: true)
            case .voice:
                speechService.reset()
                audioLevel.reset()
                waveform.reset()
            case .chat:
                chatSession?.messages.removeAll()
            }
            try? await Task.sleep(nanoseconds: 300_000_000)
            await MainActor.run { isReloading = false }
        }
    }

    // MARK: - Persistence

    private static let screenKey = "ultron-screen"

    private static func restoreTab() -> UltronTab {
        guard let raw = UserDefaults.standard.string(forKey: screenKey),
              let tab = UltronTab(rawValue: raw) else {
            return .cockpit
        }
        return tab
    }

    // MARK: - Live label (top-bar)

    /// Live status pill — pulls from the real sources:
    /// - Cockpit → "opdateret 12s" from `infoService.lastRefresh`
    /// - Voice → "Lytter · 3.2s" (recording elapsed) / "Tænker" /
    ///   "Taler" / "Klar · ⌥ Space" driven by `hudState.currentPhase`
    /// - Chat → "Skriver · 420ms" when `usageTracker.isTurnInFlight`,
    ///   else "Model · gemini-2.5-flash" / "Klar"
    private var liveLabel: String {
        switch activeTab {
        case .cockpit:
            if case .loading = infoService.state { return "Cockpit · opdaterer…" }
            return "Cockpit · opdateret " + relativeRefresh()
        case .voice:
            switch hudState.currentPhase {
            case .recording:     return "Lytter · ⌥ Space"
            case .processing:    return "Tænker · ◌"
            case .result:        return "Taler"
            case .error:         return "Fejl"
            case .permissionError: return "Mangler adgang"
            default:             return "Klar · ⌥ Space"
            }
        case .chat:
            if usageTracker.isTurnInFlight { return "Skriver…" }
            if let model = usageTracker.lastModelName {
                return "Model · \(model)"
            }
            return "Klar · ⌘ ⏎"
        }
    }

    private var livePulsing: Bool {
        switch activeTab {
        case .cockpit: return false
        case .voice:
            if case .recording = hudState.currentPhase { return true }
            if case .processing = hudState.currentPhase { return true }
            return false
        case .chat: return usageTracker.isTurnInFlight
        }
    }

    private func relativeRefresh() -> String {
        guard let last = infoService.lastRefresh else { return "—" }
        let sec = Int(Date().timeIntervalSince(last))
        if sec < 60 { return "\(sec)s" }
        if sec < 3_600 { return "\(sec / 60)m" }
        return "\(sec / 3_600)t"
    }

    // MARK: - Hotkey sheet overlay

    @ViewBuilder
    private var hotkeySheetOverlay: some View {
        if showHotkeySheet {
            ZStack {
                Color.black.opacity(0.45).ignoresSafeArea()
                    .onTapGesture { showHotkeySheet = false }
                HotkeySheet(onClose: { showHotkeySheet = false })
            }
            .transition(.opacity)
            .animation(UltronTheme.stateEase, value: showHotkeySheet)
        }
    }
}

// MARK: - Tab content hosts

/// Voice tab host — attaches the shared audio engine's tap to the
/// Ultron voice card so the waveform + decibel meter pulse with live
/// mic input whenever the tab is visible.
///
/// Behaviour:
/// - On appear: start `SharedAudioEngine`, subscribe with a tap handler
///   that feeds both `AudioLevelMonitor` (RMS) and `WaveformBuffer`
///   (peak). On disappear: unsubscribe — the engine stops itself once
///   the last subscriber leaves (recording subscriber is separate).
/// - Poll `AudioDeviceInfo.currentInputName` / `currentOutputName`
///   every 2 s so the mic + speaker labels update when the user
///   switches default device in System Settings → Sound.
private struct UltronVoiceHost: View {
    let audioLevel: AudioLevelMonitor
    let waveform: WaveformBuffer
    @Bindable var hudState: HUDState
    @Bindable var speechService: SpeechRecognitionService
    @Bindable var usageTracker: UsageTracker
    let onSendToChat: (String) -> Void

    @State private var inputName: String = AudioDeviceInfo.currentInputName() ?? "—"
    @State private var outputName: String = AudioDeviceInfo.currentOutputName() ?? "—"
    @State private var monitorToken: UUID?
    @State private var recordingStart: Date?
    @State private var lastQueryForThinking: String = ""
    private let deviceTick = Timer.publish(every: 2, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            UltronTheme.rootBackground.ignoresSafeArea()
            UltronVoiceView(
                state: .constant(derivedState),
                waveform: sampledWaveform,
                duration: derivedDuration,
                inputMic: inputName,
                outputSpeaker: outputName,
                noiseDB: noiseDB,
                modelName: usageTracker.lastModelName ?? "—",
                inputTokens: usageTracker.lastInputTokens,
                outputTokens: usageTracker.lastOutputTokens,
                latencyMs: usageTracker.lastLatencyMs,
                onSendToChat: onSendToChat,
                liveTranscript: speechService.transcript
            )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear(perform: startMonitoring)
        .onDisappear(perform: stopMonitoring)
        .onReceive(deviceTick) { _ in refreshDeviceNames() }
        .onChange(of: hudState.currentPhase) { _, new in
            updateRecordingTimer(for: new)
        }
    }

    // MARK: - Derived voice state

    /// Bridge from the legacy `HUDState.Phase` + `SpeechRecognitionService.transcript`
    /// into the Ultron-native `UltronVoiceState`. The legacy voice pipeline
    /// drives both and we just read them — no new wiring needed.
    private var derivedState: UltronVoiceState {
        switch hudState.currentPhase {
        case .recording:
            return .listening(partial: speechService.transcript, final: "")
        case .processing:
            return .thinking(query: lastQueryForThinking.isEmpty
                             ? speechService.transcript
                             : lastQueryForThinking)
        case let .result(text):
            return .speaking(answer: text, citations: [])
        default:
            return .idle
        }
    }

    private var derivedDuration: TimeInterval {
        guard let start = recordingStart else { return 0 }
        return Date().timeIntervalSince(start)
    }

    private func updateRecordingTimer(for phase: HUDState.Phase) {
        switch phase {
        case .recording:
            if recordingStart == nil { recordingStart = Date() }
        case .processing:
            // Freeze the transcript as the "query" so it stays visible
            // while the pipeline thinks, even if `speechService.transcript`
            // gets reset by the next recognition task.
            if !speechService.transcript.isEmpty {
                lastQueryForThinking = speechService.transcript
            }
            recordingStart = nil
        default:
            recordingStart = nil
        }
    }

    // MARK: - Audio monitoring lifecycle

    private func startMonitoring() {
        guard monitorToken == nil else { return }
        do {
            try SharedAudioEngine.shared.start()
        } catch {
            LoggingService.shared.log("Voice HUD: SharedAudioEngine.start failed — \(error)", level: .warning)
            return
        }
        let level = audioLevel
        let wave = waveform
        monitorToken = SharedAudioEngine.shared.addSubscriber { buffer in
            handleBuffer(buffer, level: level, waveform: wave)
        }
        refreshDeviceNames()
    }

    private func stopMonitoring() {
        if let token = monitorToken {
            SharedAudioEngine.shared.removeSubscriber(token)
            monitorToken = nil
        }
        audioLevel.reset()
        waveform.reset()
    }

    /// Runs on the audio-render thread. Mirrors `AudioCaptureManager`'s
    /// RMS + peak math so the level / waveform indicators feel identical
    /// whether or not a recording is in progress.
    private nonisolated static func handleBuffer(
        _ buffer: AVAudioPCMBuffer,
        level: AudioLevelMonitor,
        waveform: WaveformBuffer
    ) {
        guard let channelData = buffer.floatChannelData?[0] else { return }
        let frameCount = Int(buffer.frameLength)
        var sumOfSquares: Float = 0
        var peak: Float = 0
        for i in 0..<frameCount {
            let s = max(-1.0, min(1.0, channelData[i]))
            sumOfSquares += s * s
            if abs(s) > abs(peak) { peak = s }
        }
        let rms = frameCount > 0 ? sqrt(sumOfSquares / Float(frameCount)) : 0
        let boostedRMS = min(1.0, Double(rms) * 3.0)
        let oscPeak = max(-1.0, min(1.0, peak * 2.5))
        Task { @MainActor in
            level.submit(rms: boostedRMS)
            waveform.push(peak: oscPeak)
        }
    }

    private func handleBuffer(_ buffer: AVAudioPCMBuffer, level: AudioLevelMonitor, waveform: WaveformBuffer) {
        Self.handleBuffer(buffer, level: level, waveform: waveform)
    }

    // MARK: - Device name polling

    private func refreshDeviceNames() {
        if let input = AudioDeviceInfo.currentInputName(), input != inputName {
            inputName = input
        }
        if let output = AudioDeviceInfo.currentOutputName(), output != outputName {
            outputName = output
        }
    }

    // MARK: - UI derivations

    /// Downsample the 200-bucket `WaveformBuffer` to the 48 bars the
    /// Ultron strip expects. Normalises -1…1 peaks to 0…1 amplitudes.
    private var sampledWaveform: [Double] {
        let samples = waveform.samples
        guard !samples.isEmpty else { return [] }
        let target = 48
        return (0..<target).map { i in
            let idx = Int(Double(i) * Double(samples.count - 1) / Double(target - 1))
            return Double(abs(samples[idx]))
        }
    }

    /// Convert the smoothed RMS (0…1) to a dBFS integer for the meta row.
    /// Level=0 floor = -80 dB.
    private var noiseDB: Int {
        let lvl = max(0.0001, audioLevel.level)
        return max(-80, Int((20 * log10(lvl)).rounded()))
    }
}

private struct UltronChatHost: View {
    let session: ChatSession?
    @Bindable var usageTracker: UsageTracker
    let conversationHistory: [ConversationStore.Metadata]
    let currentConversationID: UUID?
    let onSend: (String) -> Void
    let onApprove: () -> Void
    let onReject: () -> Void
    let onLoadConversation: (UUID) -> Void
    let onDeleteConversation: (UUID) -> Void

    var body: some View {
        ZStack {
            UltronTheme.rootBackground.ignoresSafeArea()
            UltronChatView(
                session: session,
                usageTracker: usageTracker,
                conversationHistory: conversationHistory,
                currentConversationID: currentConversationID,
                onSend: onSend,
                onApprove: onApprove,
                onReject: onReject,
                onLoadConversation: onLoadConversation,
                onDeleteConversation: onDeleteConversation
            )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Hotkey sheet

private struct HotkeySheet: View {
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text("Taster")
                    .font(UltronTheme.Typography.sectionH2())
                    .foregroundStyle(UltronTheme.text)
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .foregroundStyle(UltronTheme.textMute)
                }
                .buttonStyle(.plain)
            }

            VStack(alignment: .leading, spacing: 10) {
                row("1 / 2 / 3",   "Skift tab — Cockpit / Stemme / Chat")
                row("⌥ Space",     "Hold for diktering")
                row("⌥ Q",         "Hold for spørg")
                row("⌥ ⇧ Space",   "Hold for vision")
                row("⌥ M",         "Skift mode")
                row("⌥ Return",    "Toggle chat")
                row("⌥ ⇧ I",       "Cockpit")
                row("⌥ ⇧ B",       "Briefing")
                row("⌘ K",         "Værktøjspaletten")
                row("Esc",         "Luk overlay")
            }
        }
        .padding(28)
        .frame(width: 480)
        .background(
            RoundedRectangle(cornerRadius: UltronTheme.Radius.composer, style: .continuous)
                .fill(UltronTheme.ink2)
                .overlay(
                    RoundedRectangle(cornerRadius: UltronTheme.Radius.composer, style: .continuous)
                        .stroke(UltronTheme.line, lineWidth: 1)
                )
        )
        .shadow(color: .black.opacity(0.5), radius: 40, y: 20)
    }

    private func row(_ key: String, _ desc: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 14) {
            Text(key)
                .font(UltronTheme.Typography.kvLabel())
                .padding(.vertical, 3)
                .padding(.horizontal, 8)
                .background(
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(UltronTheme.ink)
                        .overlay(
                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .stroke(UltronTheme.line, lineWidth: 1)
                        )
                )
                .foregroundStyle(UltronTheme.text)
                .frame(width: 110, alignment: .leading)
            Text(desc)
                .font(UltronTheme.Typography.body())
                .foregroundStyle(UltronTheme.textDim)
            Spacer()
        }
    }
}

// MARK: - Keyboard shortcut binder

/// Traps 1 / 2 / 3 / ? / Esc at the window level so the tabs respond
/// without needing focus on a particular control. NSEvent local monitor
/// is cleaned up on view disappear.
private struct KeyShortcutBinder: NSViewRepresentable {
    let onTab: (UltronTab) -> Void
    let onEscape: () -> Void
    let onQuestion: () -> Void

    func makeNSView(context: Context) -> NSView {
        let view = KeyMonitorView()
        view.onTab = onTab
        view.onEscape = onEscape
        view.onQuestion = onQuestion
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}

    private final class KeyMonitorView: NSView {
        var onTab: ((UltronTab) -> Void)?
        var onEscape: (() -> Void)?
        var onQuestion: (() -> Void)?
        private var monitor: Any?

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if monitor == nil {
                monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
                    self?.handle(event) == true ? nil : event
                }
            }
        }

        override func removeFromSuperview() {
            if let m = monitor {
                NSEvent.removeMonitor(m)
                monitor = nil
            }
            super.removeFromSuperview()
        }

        private func handle(_ event: NSEvent) -> Bool {
            // Only act when no modifier keys are pressed other than Shift.
            let raw = event.charactersIgnoringModifiers
            switch raw {
            case "1": onTab?(.cockpit); return true
            case "2": onTab?(.voice);   return true
            case "3": onTab?(.chat);    return true
            case "?": onQuestion?();    return true
            default: break
            }
            if event.keyCode == 53 {  // Escape
                onEscape?()
                return true
            }
            return false
        }
    }
}
