import AppKit
import SwiftUI

/// NSPanel subclass that accepts key / main status so SwiftUI
/// `TextField` inputs receive keystrokes. Without this override the
/// default `NSPanel` behaviour (floating, non-activating) blocks
/// keyboard focus and the chat composer goes dead.
final class SkynetKeyablePanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

@MainActor
class HUDWindowController {
    private var panel: NSPanel?
    private var autoCloseTask: Task<Void, Never>?
    private var recordingTimerTask: Task<Void, Never>?
    /// Remembered so hover-leave can restart the timer with the same budget
    /// the caller originally requested (confirmation=3s, result=30s, error=10s).
    private var lastAutoCloseSeconds: TimeInterval?
    let hudState = HUDState()
    let audioLevel = AudioLevelMonitor()
    let waveform = WaveformBuffer()
    let speechService = SpeechRecognitionService()
    /// Current mode name shown in the HUD badge. AppDelegate keeps this in sync.
    var activeModeName: String = ""
    /// Set by AppDelegate once services exist, then passed into UptodateView.
    var updatesService: UpdatesService?
    /// Set by AppDelegate once services exist, then passed into InfoModeView.
    var infoModeService: InfoModeService?
    /// Set by AppDelegate once services exist. When nil, focus suppression
    /// is a no-op (defensive — lets the app run even if wiring regresses).
    var focusObserver: FocusModeObserver?
    /// Shared usage-tracker from AppDelegate so the Ultron Chat / Voice
    /// HUDs can render live model + token + latency stats.
    var usageTracker: UsageTracker?
    var onAgentChatSend: ((String) -> Void)?
    var onAgentApprove: (() -> Void)?
    var onAgentReject: (() -> Void)?

    var onSpeakRequested: ((String) -> Void)?
    var onCloseRequested: (() -> Void)?
    var onMaxRecordingReached: (() -> Void)?
    var onPermissionAction: (() -> Void)?
    var onChatSend: ((String) -> Void)?
    var onPinToggle: (() -> Void)?
    var chatSession: ChatSession?
    // β.11: unified chat command-bar wiring.
    var commandRouter: ChatCommandRouter?
    var shortcutLookup: (Mode) -> String? = { _ in nil }
    var onToggleVoiceRecord: (() -> Void)?
    var inputBuffer: ChatInputBuffer?
    var permissionsManager: PermissionsManager?
    var onOpenSettings: (() -> Void)?
    // v1.1.5 history sidebar
    var conversationHistory: [ConversationStore.Metadata] = []
    var currentConversationID: UUID?
    var onLoadConversation: ((UUID) -> Void)?
    var onDeleteConversation: ((UUID) -> Void)?

    private var recordingStartTime: Date?

    // MARK: - Public API

    func showRecording() {
        hudState.currentPhase = .recording(elapsed: 0)
        recordingStartTime = Date()
        presentPanel()
        startRecordingTimer()
    }

    func showProcessing() {
        cancelRecordingTimer()
        hudState.currentPhase = .processing
        if panel == nil { presentPanel() }
    }

    /// v1.4 Fase 2b: set (or clear) the narrated progress step shown in the
    /// processing HUD. Pipeline callers nil this out when their stage ends.
    func setStep(_ kind: ProcessingStep.Kind?) {
        hudState.currentStep = kind.map { ProcessingStep($0) }
    }

    /// Returns true when the user has the setting ON *and* the system
    /// currently reports itself as quiet. Treats a missing default as ON
    /// so first-launch users get sensible behaviour.
    private func shouldSuppressAutoPop() -> Bool {
        let respect = UserDefaults.standard.object(forKey: Constants.Defaults.respectFocusMode) as? Bool ?? true
        guard respect else { return false }
        return focusObserver?.isQuiet == true
    }

    func showResult(_ text: String) {
        if shouldSuppressAutoPop() {
            LoggingService.shared.log("HUD suppressed — focus mode / screen locked")
            return
        }
        cancelRecordingTimer()
        hudState.currentPhase = .result(text: text)
        if panel == nil { presentPanel() }
        scheduleAutoClose(after: Constants.Timers.resultAutoClose)
    }

    func showConfirmation(_ message: String) {
        if shouldSuppressAutoPop() {
            LoggingService.shared.log("HUD suppressed — focus mode / screen locked")
            return
        }
        cancelRecordingTimer()
        hudState.currentPhase = .confirmation(message: message)
        if panel == nil { presentPanel() }
        scheduleAutoClose(after: Constants.Timers.confirmationAutoClose)
    }

    /// v1.4 Fase 2b.5: optional retry handler displayed as "Prøv igen" in
    /// the error card. Cleared on any phase transition and on close so a
    /// stale handler can't fire against a later context.
    var onErrorRetryRequested: (() -> Void)?

    func showError(_ message: String, retryHandler: (() -> Void)? = nil) {
        if shouldSuppressAutoPop() {
            LoggingService.shared.log("HUD suppressed — focus mode / screen locked")
            return
        }
        cancelRecordingTimer()
        onErrorRetryRequested = retryHandler
        hudState.currentPhase = .error(message: message)
        if panel == nil { presentPanel() }
        scheduleAutoClose(after: Constants.Timers.errorAutoClose)
    }

    func showPermissionError(permission: String, instructions: String) {
        if shouldSuppressAutoPop() {
            LoggingService.shared.log("HUD suppressed — focus mode / screen locked")
            return
        }
        cancelRecordingTimer()
        hudState.currentPhase = .permissionError(permission: permission, instructions: instructions)
        if panel == nil { presentPanel() }
        scheduleAutoClose(after: Constants.Timers.errorAutoClose)
    }

    func showChat() {
        cancelRecordingTimer()
        hudState.currentPhase = .chat
        requestUltronTab("chat")
        if panel == nil { presentInfoPanel() }
    }

    var isChatVisible: Bool {
        hudState.isVisible && hudState.currentPhase == .chat
    }

    /// Opens the chat panel — agent tooling is activated by picking the
    /// Agent mode from the command-bar dropdown. Kept as a named function so
    /// the ⌥⇧A hotkey has a stable entry point.
    func showAgentChat() {
        showChat()
    }

    var isAgentChatVisible: Bool {
        isChatVisible
    }

    func showUptodate() {
        cancelRecordingTimer()
        cancelAutoClose()
        hudState.currentPhase = .uptodate
        requestUltronTab("cockpit")
        if panel == nil { presentInfoPanel() }
    }

    var isUptodateVisible: Bool {
        hudState.isVisible && hudState.currentPhase == .uptodate
    }

    func showInfoMode() {
        cancelRecordingTimer()
        cancelAutoClose()
        hudState.currentPhase = .infoMode
        if panel == nil {
            presentInfoPanel()
        }
    }

    var isInfoModeVisible: Bool {
        hudState.isVisible && hudState.currentPhase == .infoMode
    }

    func close() {
        cancelAutoClose()
        cancelRecordingTimer()
        lastAutoCloseSeconds = nil
        onErrorRetryRequested = nil
        panel?.close()
        panel = nil
        hudState.isVisible = false
    }

    /// Minimize the hosting panel to the Dock — wired to the yellow
    /// traffic-light dot in `UltronTopBar`.
    func minimizePanel() {
        panel?.miniaturize(nil)
    }

    /// Toggle the panel between its default size and the current screen's
    /// visible frame — wired to the green traffic-light dot in `UltronTopBar`.
    /// Uses `setFrame` directly instead of `zoom(_:)` because the panel is
    /// created with a `.borderless` style mask and AppKit's zoom path doesn't
    /// produce useful geometry for panel-class windows.
    func zoomPanel() {
        guard let panel,
              let screen = panel.screen ?? NSScreen.main else { return }
        let visible = screen.visibleFrame
        if panel.frame == visible {
            // Restore to a roughly-centred 1200×780 frame — the Ultron min size.
            let w: CGFloat = 1200
            let h: CGFloat = 780
            let origin = CGPoint(
                x: visible.midX - w / 2,
                y: visible.midY - h / 2
            )
            panel.setFrame(CGRect(origin: origin, size: CGSize(width: w, height: h)),
                           display: true,
                           animate: true)
        } else {
            panel.setFrame(visible, display: true, animate: true)
        }
    }

    // MARK: - Panel Management

    /// Broadcast when a `showChat`/`showUptodate`/`showInfoMode` call should
    /// flip the Ultron tab *live*. The unified window is already mounted,
    /// so persisting `ultron-screen` to UserDefaults alone isn't enough
    /// (`UltronMainWindow.restoreTab()` only runs at init).
    static let ultronSwitchTabNotification = Notification.Name("ultron.switchTab")

    /// Persist the Ultron tab to UserDefaults AND post a live-switch
    /// notification so an already-mounted `UltronMainWindow` updates
    /// immediately.
    private func requestUltronTab(_ tab: String) {
        UserDefaults.standard.set(tab, forKey: "ultron-screen")
        NotificationCenter.default.post(
            name: Self.ultronSwitchTabNotification,
            object: nil,
            userInfo: ["tab": tab]
        )
    }

    /// Opens Ultron if no panel is up yet. Voice / recording / error
    /// phases land on the Voice tab; chat on Chat; everything else on
    /// Cockpit. The Ultron Voice / Chat tabs observe `hudState` so any
    /// phase change while the panel is already up just updates state.
    private func presentPanel() {
        cancelAutoClose()
        if panel != nil { return }
        switch hudState.currentPhase {
        case .recording, .processing, .result, .confirmation,
             .error, .permissionError:
            requestUltronTab("voice")
        case .chat:
            requestUltronTab("chat")
        case .uptodate, .infoMode:
            requestUltronTab("cockpit")
        @unknown default:
            requestUltronTab("cockpit")
        }
        presentInfoPanel()
    }

    // MARK: - Ultron unified panel

    private func presentInfoPanel() {
        guard let infoModeService else {
            LoggingService.shared.log("Ultron panel requested but service not wired", level: .warning)
            return
        }
        cancelAutoClose()

        let view = UltronMainWindow(
            infoService: infoModeService,
            audioLevel: audioLevel,
            waveform: waveform,
            hudState: hudState,
            speechService: speechService,
            usageTracker: usageTracker ?? UsageTracker(),
            chatSession: chatSession,
            conversationHistory: conversationHistory,
            currentConversationID: currentConversationID,
            onChatSend:           { [weak self] text in self?.onChatSend?(text) },
            onAgentApprove:       { [weak self] in self?.onAgentApprove?() },
            onAgentReject:        { [weak self] in self?.onAgentReject?() },
            onLoadConversation:   { [weak self] id in self?.onLoadConversation?(id) },
            onDeleteConversation: { [weak self] id in self?.onDeleteConversation?(id) },
            onClose:              { [weak self] in self?.close() },
            onMinimize:           { [weak self] in self?.minimizePanel() },
            onZoom:               { [weak self] in self?.zoomPanel() },
            onOpenSettings:       { [weak self] in self?.onOpenSettings?() }
        )

        let hostingController = NSHostingController(rootView: view)
        // DO NOT set sizingOptions = .preferredContentSize. That option tells
        // NSHostingView to continuously observe SwiftUI's preferred size and
        // resize the window in response. Combined with MKMapView (autoresizing
        // mask) + any dynamic content, it spins into a setFrame → layout →
        // setFrame loop and overflows the main-thread stack at ~6900 frames.
        // Instead we measure the SwiftUI content's fittingSize ONCE below and
        // pin the panel to that size.

        let panel = SkynetKeyablePanel(contentViewController: hostingController)
        panel.styleMask = [.borderless, .resizable, .nonactivatingPanel]
        panel.level = .floating
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.isMovableByWindowBackground = true
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.minSize = NSSize(width: 520, height: 200)

        // One-shot measurement: force the hosting view to layout once so we
        // can read its fittingSize. Because no window is observing it yet,
        // there's no feedback loop. InfoModeView now lives inside a
        // ScrollView so the fittingSize's height is effectively "as tall as
        // the content wants", which we clamp against the visible screen.
        hostingController.view.layoutSubtreeIfNeeded()
        let fitting = hostingController.view.fittingSize
        let screenVisible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        let targetWidth = max(fitting.width, 960)
        let targetHeight = min(fitting.height, screenVisible.height - 40)
        let origin = NSPoint(
            x: screenVisible.maxX - targetWidth - Constants.HUD.padding,
            y: screenVisible.maxY - targetHeight - Constants.HUD.padding
        )
        panel.setFrame(NSRect(origin: origin, size: NSSize(width: targetWidth, height: targetHeight)), display: true)

        panel.orderFrontRegardless()
        panel.makeKey()
        self.panel = panel
        hudState.isVisible = true
    }

    /// No-op retained for call-site compatibility. The Ultron unified
    /// window doesn't persist chat-panel frame separately; kept here so
    /// `AppDelegate` callers still compile. Delete when those call
    /// sites are cleaned up.
    func saveChatFrame() {}

    // MARK: - Hover-pause (v1.3)
    // Cancel auto-close while the user is hovering the result card, resume
    // it (with a fresh countdown) on mouse-leave so long answers don't
    // vanish mid-read. Pin still wins — pinned HUDs never auto-close at all.

    func onHoverChanged(_ hovering: Bool) {
        guard panel != nil else { return }   // HUD already closed, don't restart anything
        if hovering {
            autoCloseTask?.cancel()
            autoCloseTask = nil
        } else if let seconds = lastAutoCloseSeconds {
            scheduleAutoClose(after: seconds)
        }
    }

    // MARK: - Timers

    private func scheduleAutoClose(after seconds: TimeInterval) {
        guard !hudState.isPinned else { return }
        lastAutoCloseSeconds = seconds
        cancelAutoClose()
        autoCloseTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled else { return }
            guard self?.hudState.isPinned != true else { return }
            self?.close()
        }
    }

    private func cancelAutoClose() {
        autoCloseTask?.cancel()
        autoCloseTask = nil
    }

    private func startRecordingTimer() {
        cancelRecordingTimer()
        recordingTimerTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(0.5))
                guard !Task.isCancelled, let start = self.recordingStartTime else { break }
                let elapsed = Date().timeIntervalSince(start)

                if elapsed >= Constants.maxRecordingDuration {
                    self.onMaxRecordingReached?()
                    break
                }

                self.hudState.currentPhase = .recording(elapsed: elapsed)
            }
        }
    }

    private func cancelRecordingTimer() {
        recordingTimerTask?.cancel()
        recordingTimerTask = nil
        recordingStartTime = nil
    }
}
