import AppKit
import AVFAudio
import CoreSpotlight
import SwiftUI

class AppDelegate: NSObject, NSApplicationDelegate {
    // MARK: - UI
    private var statusItem: NSStatusItem!
    private var statusMenu: NSMenu!
    private var settingsWindow: NSWindow?
    private var onboardingWindow: NSWindow?
    private let settingsHostState = SettingsHostState()

    // Menu items updated in-place
    private var modeMenuItem: NSMenuItem?
    private var usageMenuItem: NSMenuItem?
    private var modesSubmenuItem: NSMenuItem?

    // MARK: - Public (accessed by SkynetApp)
    let modeManager = ModeManager()
    let usageTracker = UsageTracker()
    lazy var hotkeyBindings = HotkeyBindings(store: hotkeyStore, manager: hotkeyManager)

    // MARK: - Services
    private let keychainService = KeychainService()
    private let hotkeyManager = HotkeyManager()
    private let hotkeyStore = HotkeyStore()
    private let hudController = HUDWindowController()
    private var pipeline: RecordingPipeline!
    let chatSession = ChatSession()
    private var chatPipeline: ChatPipeline!
    private lazy var wakeWordDetector: WakeWordDetecting = PorcupineWakeWordDetector(
        accessKeyProvider: { [weak keychainService] in keychainService?.getPorcupineKey() }
    )
    let voiceCommandService = VoiceCommandService()
    /// β.11: agent chat now shares the main chat session so the unified
    /// Spotlight-style chat window renders regular chat + agent turns in one
    /// conversation. Kept as a computed alias so legacy call sites still
    /// resolve without edits.
    /// v1.1.5: agent mode now uses the shared `chatSession` directly.
    private var agentChatPipeline: AgentChatPipeline?
    private var commandRouter: ChatCommandRouter?
    /// Shared buffer for the chat command-bar text field. Lets
    /// `handleChatVoiceToggle` push dictation transcripts back into the UI.
    private let chatInputBuffer = ChatInputBuffer()
    let locationService = LocationService()
    /// v1.4: observes screen-lock / display-sleep so the HUD can suppress
    /// auto-pop surfaces while the user is away. Instantiated once and kept
    /// for the app's lifetime.
    private let focusObserver = FocusModeObserver()
    lazy var updatesService = UpdatesService(locationService: locationService)
    lazy var infoModeService = InfoModeService(locationService: locationService)
    lazy var errorPresenter = ErrorPresenter(hudController: hudController)
    private lazy var summaryService = DocumentSummaryService(
        geminiClient: geminiClient,
        hudController: hudController,
        errorPresenter: errorPresenter
    )

    // Supporting services (owned here, injected into pipeline)
    private let audioCapture = AudioCaptureManager()
    private let textInsertion = TextInsertionService()
    private let permissions = PermissionsManager()
    private let screenCapture = ScreenCaptureService()
    private let ttsService = TTSService()
    private lazy var geminiClient: GeminiClient = {
        let client = GeminiClient(keychainService: keychainService, usageTracker: usageTracker)
        client.persona = personaService
        return client
    }()

    // v1.3.0: Skynet-persona layer. Memory is a plain list of user-curated
    // facts persisted to ~/Library/Application Support/Skynet/memory.json;
    // PersonaService blends them with a fixed persona block and injects the
    // result into conversational modes' system prompts.
    let memoryStore = SkynetMemoryStore()
    lazy var personaService = PersonaService(memory: memoryStore)

    // v1.3.0: Optional bidirectional Gemini Live Audio session. Off by
    // default — the Live models cost more than Flash. Only instantiated
    // when the user flips `liveVoiceEnabled` on.
    private lazy var liveVoiceService = LiveVoiceService(
        keychain: keychainService,
        persona: personaService
    )

    // v1.3.0: VAD used to auto-stop wake-word-triggered recordings instead of
    // the old fixed 4-second timer. Shared across wake events.
    private let wakeVAD = SimpleVAD()
    private var wakeVADSubscriberToken: UUID?
    private var wakeVADAutoStopTask: Task<Void, Never>?

    // v1.3.0: Morning briefing scheduler. Opt-in via Settings.
    private lazy var morningBriefingService = MorningBriefingService(
        locationService: locationService,
        updatesService: updatesService,
        tts: ttsService
    )

    // MARK: - App Lifecycle

    nonisolated func applicationDidFinishLaunching(_ notification: Notification) {
        MainActor.assumeIsolated {
            setupPipeline()
            setupChatPipeline()
            setupMenuBar()
            setupHotkeys()
            hotkeyBindings.applyAll()
            setupCostWarning()
            setupWakeWord()
            setupVoiceCommands()
            setupMorningBriefing()
            checkFirstLaunch()
            migrateClaudeBudgetLimits()
            // v1.1.7: spawn any MCP servers the user declared in ~/.skynet/mcp.json
            // and register their tools with the shared agent registry. Runs in
            // the background — we don't block app launch if a server is slow.
            Task { await MCPRegistry.shared.bootstrap() }
            // v1.4 Fase 4 slice: register ourselves as a services-menu
            // provider so "Ask Skynet about this" appears in every app's
            // Services submenu for selected text. The Info.plist NSServices
            // array advertises the action; this call tells AppKit we're
            // ready to handle it.
            NSApplication.shared.servicesProvider = self
            NSUpdateDynamicServices()
            // v1.2.0: ping GitHub Releases once a day to see if a newer
            // Skynet DMG is published. Non-blocking; prompts only when a
            // higher semver is found.
            updateChecker.checkIfDue()
            // v2.0: pre-warm the Cockpit data sources in the background so
            // the first time the user opens Ultron the tiles already have
            // live commute + weather + charger data. The refresh runs off
            // the main actor via the service's internal Task; this call
            // just kicks it off. Subsequent opens hit the 2-minute cache.
            Task { await infoModeService.refresh() }
            LoggingService.shared.log("Skynet v\(Constants.appVersion) started")
        }
    }

    nonisolated func applicationWillTerminate(_ notification: Notification) {
        MainActor.assumeIsolated {
            MCPRegistry.shared.shutdown()
        }
    }

    // MARK: - Services menu (v1.4 Fase 4 slice)

    /// Called by AppKit when the user picks "Ask Skynet about this" from any
    /// app's Services submenu. The `NSMessage` key in Info.plist maps this
    /// selector; pasteboard contains the selected plain text.
    ///
    /// Behaviour: pull the text, route it through the chat as a Q&A-mode
    /// prompt, and show the HUD. Matches the `open skynet://qna?prompt=…`
    /// URL scheme flow so the handling is unified.
    @objc func askSkynetAboutSelection(_ pboard: NSPasteboard, userData: String?, error: AutoreleasingUnsafeMutablePointer<NSString>) {
        guard let text = pboard.string(forType: .string)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else {
            LoggingService.shared.log("Services: empty pasteboard — nothing to ask", level: .warning)
            return
        }
        LoggingService.shared.log("Services: ask Skynet about \(text.count)-char selection")
        // Reuse the same chat-opening path the ⌥C hotkey uses. Route through
        // the chat command router in Q&A mode so web-search grounds the reply.
        Task { @MainActor in
            hudController.showChat()
            await commandRouter?.run(mode: BuiltInModes.qna, input: text)
        }
    }

    /// v1.1.8: handle incoming `skynet://…` URLs from the OS / Shortcuts /
    /// automation tools. Supported:
    ///   - skynet://chat?prompt=TEXT      — open chat, pre-fill the bar
    ///   - skynet://qna?prompt=TEXT       — run Q&A with the given prompt
    ///   - skynet://summarize             — open picker + summarize
    ///   - skynet://vision?prompt=TEXT    — capture screen + ask
    ///   - skynet://info / ://briefing    — open the respective panel
    nonisolated func application(_ application: NSApplication, open urls: [URL]) {
        MainActor.assumeIsolated {
            for url in urls { handleSkynetURL(url) }
        }
    }

    private func handleSkynetURL(_ url: URL) {
        guard url.scheme?.lowercased() == "skynet" else { return }
        let action = (url.host ?? "").lowercased()
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let prompt = components?.queryItems?.first(where: { $0.name == "prompt" })?.value ?? ""

        switch action {
        case "chat":
            refreshConversationHistory()
            hudController.showChat()
            if !prompt.isEmpty { chatInputBuffer.text = prompt }
        case "qna":
            refreshConversationHistory()
            hudController.showChat()
            if !prompt.isEmpty, let router = commandRouter {
                Task { await router.run(mode: BuiltInModes.qna, input: prompt) }
            }
        case "summarize":
            summaryService.summarizeInteractively()
        case "vision":
            refreshConversationHistory()
            hudController.showChat()
            if let router = commandRouter {
                Task { await router.run(mode: BuiltInModes.vision, input: prompt) }
            }
        case "dictate-clipboard":
            // Fire-and-forget URL entry. AppIntent callers invoke
            // `dictateToClipboard(seconds:)` directly so they can await
            // the transcript; the URL scheme just kicks off the flow
            // with HUD feedback.
            Task { _ = await dictateToClipboard(seconds: 6) }
        case "info", "cockpit":
            hudController.showInfoMode()
        case "briefing", "uptodate":
            hudController.showUptodate()
        case "conversation":
            // Spotlight hit or explicit skynet://conversation?id=UUID —
            // open the chat window and load the requested transcript.
            guard let idString = components?.queryItems?.first(where: { $0.name == "id" })?.value,
                  let uuid = UUID(uuidString: idString) else {
                LoggingService.shared.log("skynet://conversation missing id", level: .warning)
                return
            }
            refreshConversationHistory()
            hudController.showChat()
            loadConversationIntoChat(id: uuid)
        default:
            LoggingService.shared.log("Unknown skynet:// action: \(action)", level: .warning)
        }
    }

    /// Spotlight taps arrive as an `NSUserActivity` of type
    /// `CSSearchableItemActionType`, not as a `skynet://` URL — AppKit
    /// routes them here. Pull the conversation UUID out of the activity
    /// userInfo (`CSSearchableItemActivityIdentifier`) and open the chat.
    nonisolated func application(_ application: NSApplication, continue userActivity: NSUserActivity,
                                 restorationHandler: @escaping ([NSUserActivityRestoring]) -> Void) -> Bool {
        guard userActivity.activityType == CSSearchableItemActionType,
              let idString = userActivity.userInfo?[CSSearchableItemActivityIdentifier] as? String,
              let uuid = UUID(uuidString: idString) else {
            return false
        }
        MainActor.assumeIsolated {
            refreshConversationHistory()
            hudController.showChat()
            loadConversationIntoChat(id: uuid)
        }
        return true
    }

    // MARK: - Pipeline Setup

    private func setupPipeline() {
        // Wire the mic tap's RMS + peak samples into the HUD's live visualisers.
        audioCapture.levelMonitor = hudController.audioLevel
        audioCapture.waveformBuffer = hudController.waveform

        // Ask for on-device speech-recognition auth up front so the first ⌥Q
        // isn't interrupted by a permission prompt.
        Task { await hudController.speechService.requestAuthorization() }

        // v1.4 Fase 2c: always ask for location on startup so Cockpit's
        // weather / commute / sun tiles have fresh GPS-driven data without
        // waiting for the user to open Info mode. No-op after the first
        // grant (macOS dedupes repeat authorization requests).
        locationService.requestAuthorization()
        Task { _ = await locationService.refresh() }

        // Wire the Uptodate + Info panel data sources.
        hudController.updatesService = updatesService
        hudController.infoModeService = infoModeService
        hudController.usageTracker = usageTracker

        pipeline = RecordingPipeline(
            audioCapture: audioCapture,
            geminiClient: geminiClient,
            textInsertion: textInsertion,
            screenCapture: screenCapture,
            permissions: permissions,
            hudController: hudController,
            ttsService: ttsService,
            modeManager: modeManager
        )

        pipeline.onStateChanged = { [weak self] state in
            self?.updateMenuBarIcon(state: state)
            self?.updateUsageLabel()
        }
    }

    // MARK: - Chat Pipeline Setup

    private func setupChatPipeline() {
        hudController.chatSession = chatSession

        chatPipeline = ChatPipeline(
            geminiClient: geminiClient,
            chatSession: chatSession,
            hudController: hudController
        )

        hudController.onChatSend = { [weak self] text in
            self?.chatPipeline.sendTextMessage(text)
        }

        hudController.onPinToggle = { [weak self] in
            guard let self else { return }
            self.hudController.hudState.isPinned.toggle()
        }

        // Agent chat — lazily instantiated on first ⌥⇧A press so users who
        // never use it don't pay the Anthropic provider init cost.
        hudController.onAgentChatSend = { [weak self] text in
            self?.ensureAgentChatPipeline().sendTextMessage(text)
        }
        hudController.onAgentApprove = { [weak self] in
            self?.ensureAgentChatPipeline().approvePendingConfirmation()
        }
        hudController.onAgentReject = { [weak self] in
            self?.ensureAgentChatPipeline().rejectPendingConfirmation()
        }

        // β.11: unified command router — chat window uses this to dispatch
        // all modes (text/voice/screenshot/document) into a single message
        // thread, keeping direct hotkey invocations unchanged.
        let router = ChatCommandRouter(
            chatPipeline: chatPipeline,
            agentChatPipeline: { [weak self] in self?.ensureAgentChatPipeline() },
            geminiClient: geminiClient,
            screenCapture: screenCapture,
            summaryService: summaryService,
            chatSession: chatSession,
            instantAnswers: InstantAnswerProvider(infoModeService: infoModeService)
        )
        commandRouter = router
        hudController.commandRouter = router
        hudController.shortcutLookup = { [weak self] mode in
            guard let self else { return nil }
            return self.shortcutStringFor(mode: mode)
        }
        hudController.onToggleVoiceRecord = { [weak self] in
            self?.handleChatVoiceToggle()
        }
        hudController.inputBuffer = chatInputBuffer
        hudController.permissionsManager = permissions
        hudController.onOpenSettings = { [weak self] in
            self?.openSettings()
        }

        // v1.1.5: history sidebar wiring. Metadata is re-read every time the
        // chat panel opens so newly-saved conversations show up without a
        // restart. Load/delete pipe through to the on-disk store.
        hudController.onLoadConversation = { [weak self] id in
            self?.loadConversationIntoChat(id: id)
        }
        hudController.onDeleteConversation = { [weak self] id in
            self?.deleteConversation(id: id)
        }
        refreshConversationHistory()
    }

    private let conversationStore = ConversationStore()
    private let updateChecker = UpdateChecker()

    private func refreshConversationHistory() {
        hudController.conversationHistory = conversationStore.loadAllMetadata()
    }

    private func loadConversationIntoChat(id: UUID) {
        guard let conversation = conversationStore.load(id: id) else { return }
        chatSession.replaceMessages(conversation.messages)
        hudController.currentConversationID = id
    }

    private func deleteConversation(id: UUID) {
        conversationStore.delete(id: id)
        if hudController.currentConversationID == id {
            chatSession.clear()
            hudController.currentConversationID = nil
        }
        refreshConversationHistory()
    }

    /// Map a mode to the hotkey that invokes its equivalent direct action,
    /// so the mode picker can show keyboard shortcuts. Only built-ins with a
    /// matching `HotkeyAction` return a value — custom user modes just show
    /// no shortcut.
    private func shortcutStringFor(mode: Mode) -> String? {
        let action: HotkeyAction?
        switch mode.id {
        case BuiltInModes.dictation.id: action = .dictation
        case BuiltInModes.qna.id:       action = .qna
        case BuiltInModes.vision.id:    action = .vision
        case BuiltInModes.translate.id: action = .translate
        case BuiltInModes.summarize.id: action = .summarize
        case BuiltInModes.agent.id:     action = .agent
        case BuiltInModes.chat.id:      action = .toggleChat
        default:                        action = nil
        }
        guard let action else { return nil }
        return hotkeyBindings.binding(for: action).displayString
    }

    /// Chat-dictation: record mic directly (not via RecordingPipeline, which
    /// would paste/HUD), transcribe, drop the result into the chat's command
    /// text so the user can review + edit before sending. Written as a single
    /// method so there's only one state machine to reason about.
    private func handleChatVoiceToggle() {
        let buffer = chatInputBuffer
        if buffer.isRecording {
            // Stop + transcribe
            let audioData = audioCapture.stopRecording()
            buffer.isRecording = false
            guard !audioData.isEmpty else { return }
            buffer.isTranscribing = true

            Task { [weak self] in
                guard let self else { return }
                let result = await self.geminiClient.sendAudio(audioData, mode: BuiltInModes.dictation)
                await MainActor.run {
                    buffer.isTranscribing = false
                    switch result {
                    case .success(let transcript):
                        let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !trimmed.isEmpty {
                            // Append to whatever the user had already typed —
                            // lets them combine typed context with spoken content.
                            if buffer.text.isEmpty {
                                buffer.text = trimmed
                            } else {
                                buffer.text += " " + trimmed
                            }
                        }
                    case .failure(let error):
                        LoggingService.shared.log("Chat dictation transcription failed: \(error)", level: .warning)
                    }
                }
            }
        } else {
            // Only start if RecordingPipeline isn't already using the mic
            // via a hotkey — sharing AudioCaptureManager with two concurrent
            // sessions would step on the WAV header.
            if case .recording = hudController.hudState.currentPhase { return }
            do {
                try audioCapture.startRecording()
                buffer.isRecording = true
            } catch {
                LoggingService.shared.log("Chat dictation start failed: \(error)", level: .warning)
            }
        }
    }

    // MARK: - AppIntents helpers (v1.2.2)
    //
    // The three methods below back the Siri/Shortcuts intents in
    // `SkynetAppIntents.swift`. Kept on AppDelegate (rather than free
    // functions) so they share the same `geminiClient`, `audioCapture`,
    // and `hudController` instances as the hotkey-driven paths — no
    // second set of services to keep in sync.

    /// Push-to-talk for a fixed `seconds` window, transcribe via Gemini,
    /// copy the result to the system pasteboard. Returns the trimmed
    /// transcript (empty string on mic denial or Gemini failure).
    @MainActor
    func dictateToClipboard(seconds: TimeInterval = 6) async -> String {
        guard permissions.checkMicrophone() else {
            hudController.showError("Mikrofon-tilladelse mangler")
            return ""
        }
        hudController.activeModeName = "Dictation → Clipboard"
        hudController.showRecording()
        do {
            try audioCapture.startRecording()
        } catch {
            hudController.showError("Mic fejl: \(error.localizedDescription)")
            return ""
        }
        try? await Task.sleep(for: .seconds(seconds))
        let audioData = audioCapture.stopRecording()
        hudController.showProcessing()
        guard !audioData.isEmpty else {
            hudController.close()
            return ""
        }
        let result = await geminiClient.sendAudio(audioData, mode: BuiltInModes.dictation)
        switch result {
        case .success(let text):
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            let pb = NSPasteboard.general
            pb.clearContents()
            pb.setString(trimmed, forType: .string)
            hudController.showConfirmation("Kopieret til udklipsholder")
            return trimmed
        case .failure(let error):
            hudController.showError("Transkription fejlede: \(error.localizedDescription)")
            return ""
        }
    }

    /// Fetch a URL, strip tags/scripts/styles, cap at 8 KB of readable text,
    /// then ask Gemini for a 3-bullet summary. Throws on fetch/decode/API
    /// failure so Shortcut error branches can handle it.
    @MainActor
    func summarizeURL(_ url: URL) async throws -> String {
        let (data, _) = try await URLSession.shared.data(from: url)
        guard let raw = String(data: data, encoding: .utf8)
            ?? String(data: data, encoding: .isoLatin1) else {
            throw URLError(.cannotDecodeContentData)
        }
        let stripped = raw
            .replacingOccurrences(
                of: "<script[^>]*>[\\s\\S]*?</script>",
                with: " ",
                options: .regularExpression
            )
            .replacingOccurrences(
                of: "<style[^>]*>[\\s\\S]*?</style>",
                with: " ",
                options: .regularExpression
            )
            .replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let truncated = String(stripped.prefix(8_000))
        let prompt = """
        Opsummer indholdet nedenfor i præcis 3 korte bullet points \
        (hver under 20 ord). Svar på samme sprog som teksten.

        Indhold:
        \(truncated)
        """
        let result = await geminiClient.sendText(prompt: prompt, mode: BuiltInModes.summarize)
        switch result {
        case .success(let text): return text
        case .failure(let error): throw error
        }
    }

    /// Combine selected text + a question into a single prompt, send to
    /// Gemini chat mode, return the reply as one string. Bypasses
    /// ChatPipeline because Shortcuts wants a synchronous value — no
    /// streaming surface needed here.
    @MainActor
    func askWithContext(selectedText: String, question: String) async throws -> String {
        let prompt = """
        Context:

        \(selectedText)

        Question: \(question)
        """
        let result = await geminiClient.sendText(prompt: prompt, mode: BuiltInModes.chat)
        switch result {
        case .success(let text): return text
        case .failure(let error): throw error
        }
    }

    /// Returns the agent pipeline, instantiating it on first use. Reads the
    /// user's preferred Claude model from UserDefaults so Settings updates
    /// can take effect on the next run.
    private func ensureAgentChatPipeline() -> AgentChatPipeline {
        if let pipeline = agentChatPipeline { return pipeline }
        let provider = AnthropicProvider(keychain: keychainService)
        let modelID = UserDefaults.standard.string(forKey: Constants.Defaults.agentClaudeModel)
            ?? "claude-sonnet-4-6"
        let pipeline = AgentChatPipeline(
            provider: provider,
            chatSession: chatSession,
            modelID: modelID
        )
        agentChatPipeline = pipeline
        return pipeline
    }

    /// Called by `SettingsView` after the user saves a new API key so the chat pipeline
    /// drops its cached SDK Chat (which was constructed with the old key).
    func resetChatPipelineForKeyRotation() {
        chatPipeline?.reset()
        LoggingService.shared.log("Chat pipeline reset after API key rotation")
    }

    // MARK: - Menu Bar

    private func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "waveform.circle", accessibilityDescription: "Skynet")
            button.image?.isTemplate = true
        }

        buildMenu()
    }

    private func buildMenu() {
        statusMenu = NSMenu()

        let headerItem = NSMenuItem(title: "Skynet v\(Constants.appVersion)", action: nil, keyEquivalent: "")
        headerItem.isEnabled = false
        statusMenu.addItem(headerItem)
        statusMenu.addItem(NSMenuItem.separator())

        let modeItem = NSMenuItem(title: "Mode: \(modeManager.activeMode.name)", action: nil, keyEquivalent: "")
        modeItem.isEnabled = false
        self.modeMenuItem = modeItem
        statusMenu.addItem(modeItem)

        let modesItem = NSMenuItem(title: "Switch Mode", action: nil, keyEquivalent: "")
        modesItem.submenu = buildModesSubmenu()
        self.modesSubmenuItem = modesItem
        statusMenu.addItem(modesItem)

        statusMenu.addItem(NSMenuItem.separator())

        let usageItem = NSMenuItem(title: usageTracker.formattedUsage, action: nil, keyEquivalent: "")
        usageItem.isEnabled = false
        self.usageMenuItem = usageItem
        statusMenu.addItem(usageItem)

        statusMenu.addItem(NSMenuItem.separator())

        // Quick-launch panels
        let infoItem = NSMenuItem(title: "Info mode", action: #selector(openInfoModeFromMenu), keyEquivalent: "i")
        infoItem.target = self
        infoItem.keyEquivalentModifierMask = [.option]
        statusMenu.addItem(infoItem)

        let uptodateItem = NSMenuItem(title: "Briefing", action: #selector(openUptodateFromMenu), keyEquivalent: "u")
        uptodateItem.target = self
        uptodateItem.keyEquivalentModifierMask = [.option]
        statusMenu.addItem(uptodateItem)

        // Hotkey cheat sheet submenu
        let shortcutsItem = NSMenuItem(title: "Hurtig-genveje", action: nil, keyEquivalent: "")
        shortcutsItem.submenu = buildShortcutsSubmenu()
        statusMenu.addItem(shortcutsItem)

        statusMenu.addItem(NSMenuItem.separator())

        let hotkeysItem = NSMenuItem(title: "Tilpas hotkeys…", action: #selector(openHotkeysSettings), keyEquivalent: "")
        hotkeysItem.target = self
        statusMenu.addItem(hotkeysItem)

        let cheatSheetItem = NSMenuItem(title: "Hotkeys & kommandoer…", action: #selector(openCheatSheet), keyEquivalent: "?")
        cheatSheetItem.target = self
        cheatSheetItem.keyEquivalentModifierMask = [.command]
        statusMenu.addItem(cheatSheetItem)

        let updatesItem = NSMenuItem(title: "Søg efter opdateringer…", action: #selector(checkForUpdates), keyEquivalent: "")
        updatesItem.target = self
        statusMenu.addItem(updatesItem)

        let settingsItem = NSMenuItem(title: "Indstillinger…", action: #selector(openSettings), keyEquivalent: ",")
        settingsItem.target = self
        statusMenu.addItem(settingsItem)

        statusMenu.addItem(NSMenuItem.separator())
        statusMenu.addItem(NSMenuItem(title: "Afslut Skynet", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))

        statusItem.menu = statusMenu
    }

    /// Read-only "cheat sheet" of active hotkeys so the user can see them at a
    /// glance without opening Settings.
    private func buildShortcutsSubmenu() -> NSMenu {
        let submenu = NSMenu()
        for action in HotkeyAction.allCases {
            let binding = hotkeyBindings.binding(for: action)
            let item = NSMenuItem(
                title: "\(action.displayName)   \(binding.displayString)",
                action: nil,
                keyEquivalent: ""
            )
            item.isEnabled = false
            submenu.addItem(item)
        }
        return submenu
    }

    private func buildModesSubmenu() -> NSMenu {
        let submenu = NSMenu()
        for mode in modeManager.allModes {
            let item = NSMenuItem(title: mode.name, action: #selector(switchMode(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = mode.id.uuidString
            if mode.id == modeManager.activeMode.id {
                item.state = .on
            }
            submenu.addItem(item)
        }
        return submenu
    }

    // MARK: - Targeted Menu Updates

    private func updateModeCheckmark() {
        modeMenuItem?.title = "Mode: \(modeManager.activeMode.name)"
        modesSubmenuItem?.submenu = buildModesSubmenu()
    }

    private func updateUsageLabel() {
        usageMenuItem?.title = usageTracker.formattedUsage
    }

    // MARK: - Menu Actions

    @objc private func switchMode(_ sender: NSMenuItem) {
        guard let idString = sender.representedObject as? String,
              let uuid = UUID(uuidString: idString) else { return }
        modeManager.setActiveMode(byId: uuid)
        updateModeCheckmark()
    }

    @objc private func openSettings() {
        presentSettings(tab: nil)
    }

    @objc private func openHotkeysSettings() {
        presentSettings(tab: .hotkeys)
    }

    private var cheatSheetWindow: NSWindow?

    @objc private func checkForUpdates() {
        Task { await updateChecker.checkNow(userInitiated: true) }
    }

    @objc private func openCheatSheet() {
        if let window = cheatSheetWindow, window.isVisible {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        let view = HotkeyCheatSheet(bindings: hotkeyBindings) { [weak self] in
            self?.cheatSheetWindow?.close()
        }
        let host = NSHostingController(rootView: view)
        host.sizingOptions = .preferredContentSize
        let window = NSWindow(contentViewController: host)
        window.title = "Hotkeys & kommandoer"
        window.styleMask = [.titled, .closable]
        window.isReleasedWhenClosed = false
        window.center()
        cheatSheetWindow = window
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func openInfoModeFromMenu() {
        if hudController.isInfoModeVisible {
            hudController.close()
        } else {
            hudController.showInfoMode()
        }
    }

    @objc private func openUptodateFromMenu() {
        if hudController.isUptodateVisible {
            hudController.close()
        } else {
            hudController.showUptodate()
        }
    }

    private func presentSettings(tab: SettingsTab?) {
        if let tab { settingsHostState.selectedTab = tab }
        if settingsWindow == nil {
            let settingsView = SettingsHost(state: settingsHostState)
                .environment(modeManager)
                .environment(usageTracker)
                .environment(hotkeyBindings)
            let hostingController = NSHostingController(rootView: settingsView)
            // Use the view's own sizing hints — SwiftUI populates the hosting
            // controller's preferredContentSize from the .frame(ideal:) modifiers.
            hostingController.sizingOptions = [.preferredContentSize]

            let window = NSWindow(contentViewController: hostingController)
            window.title = "Skynet Settings"
            window.styleMask = [.titled, .closable, .resizable, .miniaturizable, .fullSizeContentView]
            window.setContentSize(NSSize(
                width: Constants.SettingsWindow.defaultWidth,
                height: Constants.SettingsWindow.defaultHeight
            ))
            window.minSize = NSSize(
                width: Constants.SettingsWindow.minWidth,
                height: Constants.SettingsWindow.minHeight
            )
            // Persist size across launches — AppKit takes care of this automatically
            // when we give the window a frame autosave name.
            window.setFrameAutosaveName("SkynetSettingsWindow")
            window.center()
            settingsWindow = window
        }
        settingsWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // MARK: - Menu Bar Icon

    private func updateMenuBarIcon(state: RecordingState) {
        guard let button = statusItem.button else { return }
        switch state {
        case .idle:
            button.image = NSImage(systemSymbolName: "waveform.circle", accessibilityDescription: "Skynet")
            button.contentTintColor = nil
            button.title = ""
        case .recording:
            button.image = NSImage(systemSymbolName: "waveform.circle.fill", accessibilityDescription: "Recording")
            button.contentTintColor = .systemRed
            button.title = " Optager"
        case .processing:
            button.image = NSImage(systemSymbolName: "gear.circle", accessibilityDescription: "Processing")
            button.contentTintColor = .systemOrange
            button.title = " Arbejder"
        }
        button.image?.isTemplate = (state == .idle)
        button.font = NSFont.systemFont(ofSize: 11, weight: .medium)
    }

    // MARK: - Hotkeys

    private func setupHotkeys() {
        hotkeyManager.onDictationKeyDown = { [weak self] in
            self?.pipeline.handleRecordStart(mode: nil, captureScreen: false)
        }
        hotkeyManager.onDictationKeyUp = { [weak self] in
            self?.pipeline.handleRecordStop()
        }

        hotkeyManager.onQnAKeyDown = { [weak self] in
            self?.pipeline.handleRecordStart(mode: BuiltInModes.qna, captureScreen: false)
        }
        hotkeyManager.onQnAKeyUp = { [weak self] in
            self?.pipeline.handleRecordStop()
        }

        hotkeyManager.onVisionKeyDown = { [weak self] in
            self?.pipeline.handleRecordStart(mode: BuiltInModes.vision, captureScreen: true)
        }
        hotkeyManager.onVisionKeyUp = { [weak self] in
            self?.pipeline.handleRecordStop()
        }

        hotkeyManager.onModeCycle = { [weak self] in
            guard let self else { return }
            self.modeManager.cycleMode()
            self.updateModeCheckmark()
            LoggingService.shared.log("Mode cycled to: \(self.modeManager.activeMode.name)")
        }

        hotkeyManager.onChatToggle = { [weak self] in
            guard let self else { return }
            if self.hudController.isChatVisible {
                self.hudController.saveChatFrame()
                self.hudController.close()
            } else {
                self.refreshConversationHistory()
                self.hudController.showChat()
            }
        }

        hotkeyManager.onTranslateKeyDown = { [weak self] in
            self?.pipeline.handleRecordStart(mode: BuiltInModes.translate, captureScreen: false)
        }
        hotkeyManager.onTranslateKeyUp = { [weak self] in
            self?.pipeline.handleRecordStop()
        }

        hotkeyManager.onUptodate = { [weak self] in
            guard let self else { return }
            if self.hudController.isUptodateVisible {
                self.hudController.close()
            } else {
                self.hudController.showUptodate()
            }
        }

        hotkeyManager.onSummarize = { [weak self] in
            self?.summaryService.summarizeInteractively()
        }

        hotkeyManager.onAgent = { [weak self] in
            guard let self else { return }
            if self.hudController.isAgentChatVisible {
                self.hudController.saveChatFrame()
                self.hudController.close()
            } else {
                self.hudController.showAgentChat()
            }
        }

        hotkeyManager.onInfoMode = { [weak self] in
            guard let self else { return }
            if self.hudController.isInfoModeVisible {
                self.hudController.close()
            } else {
                self.hudController.showInfoMode()
            }
        }

        // Registration happens after this, via `hotkeyBindings.applyAll()` in applicationDidFinishLaunching.
    }

    // MARK: - Cost Warning

    private func setupCostWarning() {
        usageTracker.onCostWarning = { [weak self] cost in
            self?.hudController.showError(
                "Omkostningsadvarsel: Dit månedlige forbrug har nået $\(String(format: "%.2f", cost))"
            )
        }
    }

    // MARK: - Wake Word

    private func setupWakeWord() {
        NotificationCenter.default.addObserver(
            forName: .skynetWakeWordSettingsChanged,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.refreshWakeWord()
        }
        refreshWakeWord()
    }

    private func refreshWakeWord() {
        let enabled = UserDefaults.standard.bool(forKey: Constants.Defaults.wakeWordEnabled)
        if enabled {
            startWakeWord()
        } else {
            wakeWordDetector.stop()
        }
    }

    // MARK: - Voice commands (continuous on-device "Skynet ..." listener)

    private func setupVoiceCommands() {
        voiceCommandService.onCommand = { [weak self] command in
            guard let self else { return }
            switch command {
            case .info:
                if !self.hudController.isInfoModeVisible { self.hudController.showInfoMode() }
            case .uptodate:
                if !self.hudController.isUptodateVisible { self.hudController.showUptodate() }
            case .chat:
                if !self.hudController.isChatVisible { self.hudController.showChat() }
            case .qna:
                self.runVoiceRecording(mode: BuiltInModes.qna)
            case .translate:
                self.runVoiceRecording(mode: BuiltInModes.translate)
            case .summarize:
                self.summaryService.summarizeInteractively()
            case .skynetTools:
                self.runSkynetToolsQuery()
            }
        }

        NotificationCenter.default.addObserver(
            forName: .skynetVoiceCommandSettingsChanged,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.refreshVoiceCommands()
        }

        Task { [weak self] in
            guard let self else { return }
            await self.voiceCommandService.prepare()
            self.refreshVoiceCommands()
        }
    }

    /// Run a 4-second recording window triggered by a voice command. Mutes the
    /// voice-command recogniser for the duration so the tail of the same
    /// utterance doesn't re-trigger a second command.
    private func runVoiceRecording(mode: Mode) {
        voiceCommandService.suspend()
        pipeline.handleRecordStart(mode: mode, captureScreen: false)
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(4))
            self?.pipeline.handleRecordStop()
            // Give the recogniser a moment to drain its buffer before we
            // re-enable matching — another ~500ms of silence.
            try? await Task.sleep(for: .milliseconds(500))
            self?.voiceCommandService.resume()
        }
    }

    /// Voice command "Skynet kør X" → routes hele ytringen til Skynet portal's
    /// /api/siri-endpoint så LLM kan bruge alle Skynet's tools (rejseplanen,
    /// vejret, dmi-varsler, get_news, m.fl.). Resultatet vises i HUD's
    /// .result-fase som plain text.
    ///
    /// Genbruger den allerede-kørende SFSpeechRecognizer (latestPartial bliver
    /// opdateret selv mens dispatch er suspended), så vi behøver ikke starte
    /// en separat optagelse — vi venter bare på at brugeren bliver færdig med
    /// at tale og parser tail'en der.
    private func runSkynetToolsQuery() {
        voiceCommandService.suspend()
        // Vis processing-state med det samme så brugeren ved at vi lytter
        hudController.showInfoMode()
        Task { @MainActor [weak self] in
            guard let self else { return }
            // Vent ~4 sek på at brugeren afslutter ytringen — recogniseren
            // opdaterer latestPartial selv mens dispatch er suspended.
            try? await Task.sleep(for: .seconds(4))
            let utterance = self.voiceCommandService.latestPartial
            let prompt = Self.extractSkynetPrompt(from: utterance)
            defer {
                Task { @MainActor [weak self] in
                    try? await Task.sleep(for: .milliseconds(500))
                    self?.voiceCommandService.resume()
                }
            }
            guard !prompt.isEmpty else {
                self.hudController.showError("Ingen prompt opfanget — sig fx 'Skynet kør hvad er vejret'")
                return
            }
            do {
                let answer = try await SkynetPortalService.shared.askSiri(prompt: prompt)
                self.hudController.showResult(answer.isEmpty ? "Tomt svar fra Skynet." : answer)
            } catch {
                self.hudController.showError(error.localizedDescription)
            }
        }
    }

    /// Strip "skynet (kør|hjælp|sig|ask|do)" prefix og returnér selve prompten.
    /// Eksempel: "Skynet kør hvad er vejret i Næstved" → "hvad er vejret i Næstved".
    static func extractSkynetPrompt(from utterance: String) -> String {
        let lowered = utterance.lowercased()
        guard let r = lowered.range(of: "skynet", options: .backwards) else { return "" }
        var tail = String(utterance[r.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
        let keywords = ["kør", "hjælp", "sig", "ask", "do"]
        let lowerTail = tail.lowercased()
        for keyword in keywords {
            if lowerTail.hasPrefix(keyword) {
                tail = String(tail.dropFirst(keyword.count))
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                break
            }
        }
        return tail
    }

    private func refreshVoiceCommands() {
        let enabled = UserDefaults.standard.bool(forKey: Constants.Defaults.voiceCommandsEnabled)
        if enabled {
            voiceCommandService.start()
        } else {
            voiceCommandService.stop()
        }
    }

    private func startWakeWord() {
        // Stop before restart so a key change doesn't leave a dangling mic tap.
        wakeWordDetector.stop()
        do {
            try wakeWordDetector.start { [weak self] in
                self?.handleWakeWordFired()
            }
        } catch {
            LoggingService.shared.log("Wake word start failed: \(error.localizedDescription)", level: .warning)
            hudController.showError(error.localizedDescription)
        }
    }

    private func handleWakeWordFired() {
        let action = currentWakeWordAction()
        LoggingService.shared.log("Wake word fired — action=\(action.rawValue)")
        switch action {
        case .qna:
            startWakeWordQnA()
        case .chat:
            if !hudController.isChatVisible {
                refreshConversationHistory()
                hudController.showChat()
            }
            handleChatVoiceToggle()
        case .liveVoice:
            if liveVoiceService.canStart {
                liveVoiceService.start()
            } else {
                LoggingService.shared.log("Wake word: liveVoice requested but canStart=false — falling back to Q&A", level: .warning)
                startWakeWordQnA()
            }
        }
    }

    private func currentWakeWordAction() -> WakeWordAction {
        let raw = UserDefaults.standard.string(forKey: Constants.Defaults.wakeWordAction) ?? ""
        return WakeWordAction(rawValue: raw) ?? .qna
    }

    /// Q&A-style wake flow: open the HUD in recording state and let the VAD
    /// stop us when the user pauses. Hard-capped at 25 s so a stuck detector
    /// can't hold the mic forever.
    private func startWakeWordQnA() {
        pipeline.handleRecordStart(mode: BuiltInModes.qna, captureScreen: false)
        beginVADAutoStop()
    }

    private func beginVADAutoStop() {
        // Tear down any previous wake VAD session so we don't double-subscribe.
        cancelWakeVAD()

        let silenceFloor = UserDefaults.standard.double(forKey: Constants.Defaults.vadSilenceThreshold)
        if silenceFloor > 0 { wakeVAD.silenceFloor = silenceFloor }

        wakeVAD.onSilence = { [weak self] in self?.stopWakeRecording() }
        wakeVAD.onMaxDuration = { [weak self] in self?.stopWakeRecording() }

        let token = SharedAudioEngine.shared.addSubscriber { [weak self] buffer in
            guard let self, let channel = buffer.floatChannelData?[0] else { return }
            let frames = Int(buffer.frameLength)
            guard frames > 0 else { return }
            var sumOfSquares: Float = 0
            for i in 0..<frames {
                let sample = channel[i]
                sumOfSquares += sample * sample
            }
            let rms = sqrt(sumOfSquares / Float(frames))
            self.wakeVAD.submit(rms: Double(rms))
        }
        wakeVADSubscriberToken = token
        wakeVAD.start()

        // Safety-net: if VAD never fires (e.g. user silent from the start)
        // cut the session off at 25 s so the mic doesn't run forever.
        wakeVADAutoStopTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(25))
            self?.stopWakeRecording()
        }
    }

    private func stopWakeRecording() {
        cancelWakeVAD()
        pipeline.handleRecordStop()
    }

    private func cancelWakeVAD() {
        wakeVAD.stop()
        if let token = wakeVADSubscriberToken {
            SharedAudioEngine.shared.removeSubscriber(token)
            wakeVADSubscriberToken = nil
        }
        wakeVADAutoStopTask?.cancel()
        wakeVADAutoStopTask = nil
    }

    // MARK: - Morning briefing

    private func setupMorningBriefing() {
        NotificationCenter.default.addObserver(
            forName: .skynetMorningBriefingSettingsChanged,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.refreshMorningBriefing()
        }
        refreshMorningBriefing()
    }

    private func refreshMorningBriefing() {
        if UserDefaults.standard.bool(forKey: Constants.Defaults.morningBriefingEnabled) {
            morningBriefingService.start()
        } else {
            morningBriefingService.stop()
        }
    }

    // MARK: - First Launch

    private func checkFirstLaunch() {
        let hasLaunched = UserDefaults.standard.bool(forKey: Constants.Defaults.hasLaunchedBefore)
        if !hasLaunched {
            UserDefaults.standard.set(true, forKey: Constants.Defaults.hasLaunchedBefore)
            showOnboarding()
        }
    }

    /// v1.4: Claude Code budget defaults jumped from 1 M / 5 M tokens to
    /// 500 M / 2.5 B because cache-read is the dominant category and the
    /// old numbers put the Cockpit bars at >90000% for a normal week. If
    /// the stored value is still at the pre-bump tier, rewrite it to the
    /// new default. Users who deliberately set a higher number keep theirs.
    private func migrateClaudeBudgetLimits() {
        let d = UserDefaults.standard
        let dailyKey = Constants.Defaults.claudeDailyLimitTokens
        let weeklyKey = Constants.Defaults.claudeWeeklyLimitTokens
        let storedDaily = d.integer(forKey: dailyKey)
        if storedDaily > 0, storedDaily < 10_000_000 {
            d.set(Constants.ClaudeStats.defaultDailyLimit, forKey: dailyKey)
        }
        let storedWeekly = d.integer(forKey: weeklyKey)
        if storedWeekly > 0, storedWeekly < 50_000_000 {
            d.set(Constants.ClaudeStats.defaultWeeklyLimit, forKey: weeklyKey)
        }
    }

    private func showOnboarding() {
        let onboardingView = OnboardingView(
            onComplete: { [weak self] in
                self?.onboardingWindow?.close()
                self?.onboardingWindow = nil
            },
            onOpenSettings: { [weak self] in
                self?.onboardingWindow?.close()
                self?.onboardingWindow = nil
                self?.openSettings()
            }
        )
        let hostingController = NSHostingController(rootView: onboardingView)
        let window = NSWindow(contentViewController: hostingController)
        window.title = "Welcome to Skynet"
        window.styleMask = [.titled, .closable]
        window.setContentSize(NSSize(width: 480, height: 420))
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        onboardingWindow = window
    }
}

enum RecordingState {
    case idle, recording, processing
}
