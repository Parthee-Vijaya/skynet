import SwiftUI

/// v2.0 Chat screen per the Ultron handoff (Screen 3). Wired to the real
/// `ChatSession` owned by `HUDWindowController` — messages are live,
/// the composer submits through the `onSend` callback which ultimately
/// routes into `ChatCommandRouter.run(mode:input:)`.
///
/// When `session` is nil the view renders a demo seed so Xcode previews
/// still work standalone (the preview at the bottom of this file).
struct UltronChatView: View {
    @Bindable var session: ChatSession
    @Bindable var usageTracker: UsageTracker
    var conversationHistory: [ConversationStore.Metadata] = []
    var currentConversationID: UUID? = nil
    var onSend: (String) -> Void = { _ in }
    var onApprove: () -> Void = {}
    var onReject: () -> Void = {}
    var onLoadConversation: (UUID) -> Void = { _ in }
    var onDeleteConversation: (UUID) -> Void = { _ in }

    @State private var composerText: String = ""
    @State private var hoveredConversationID: UUID? = nil
    @State private var sidebarCollapsed: Bool = UserDefaults.standard
        .bool(forKey: "ultron-chat-sidebar-collapsed")
    @State private var greetingSeed = Int(Date().timeIntervalSince1970)
    @FocusState private var composerFocused: Bool

    init(
        session: ChatSession?,
        usageTracker: UsageTracker,
        conversationHistory: [ConversationStore.Metadata] = [],
        currentConversationID: UUID? = nil,
        onSend: @escaping (String) -> Void,
        onApprove: @escaping () -> Void = {},
        onReject: @escaping () -> Void = {},
        onLoadConversation: @escaping (UUID) -> Void = { _ in },
        onDeleteConversation: @escaping (UUID) -> Void = { _ in }
    ) {
        self._session = Bindable(session ?? ChatSession())
        self._usageTracker = Bindable(usageTracker)
        self.conversationHistory = conversationHistory
        self.currentConversationID = currentConversationID
        self.onSend = onSend
        self.onApprove = onApprove
        self.onReject = onReject
        self.onLoadConversation = onLoadConversation
        self.onDeleteConversation = onDeleteConversation
    }

    private var conversationTitle: String {
        if let current = currentConversationID,
           let meta = conversationHistory.first(where: { $0.id == current }) {
            return meta.title
        }
        if session.messages.isEmpty { return "Ny samtale" }
        return session.messages.first(where: { $0.role == .user })?.text.prefix(60).description
            ?? "Samtale"
    }

    var body: some View {
        HStack(spacing: 0) {
            if !sidebarCollapsed {
                sidebar
                    .frame(width: 280)
                    .background(UltronTheme.ink)
                    .overlay(alignment: .trailing) {
                        Rectangle().fill(UltronTheme.lineSoft).frame(width: 1)
                    }
                    .transition(.move(edge: .leading).combined(with: .opacity))
            }
            mainColumn
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(UltronTheme.rootBackground)
        }
        .frame(minWidth: 960, minHeight: 640)
        .animation(.easeInOut(duration: 0.28), value: sidebarCollapsed)
    }

    private func toggleSidebar() {
        sidebarCollapsed.toggle()
        UserDefaults.standard.set(sidebarCollapsed, forKey: "ultron-chat-sidebar-collapsed")
    }

    // MARK: - Sidebar

    private var sidebar: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                newConversationButton
                if todayConversations.isEmpty && earlierConversations.isEmpty {
                    groupLabel("Aktuel")
                    activeConversationRow
                } else {
                    if !todayConversations.isEmpty {
                        groupLabel("I dag")
                        ForEach(todayConversations) { conversationRow($0) }
                    }
                    if !earlierConversations.isEmpty {
                        groupLabel("Tidligere")
                        ForEach(earlierConversations) { conversationRow($0) }
                    }
                }
            }
            .padding(.horizontal, 22)
            .padding(.vertical, 18)
        }
    }

    /// Conversations modified today (day-precision `Calendar.isDateInToday`).
    private var todayConversations: [ConversationStore.Metadata] {
        conversationHistory.filter { Calendar.current.isDateInToday($0.updatedAt) }
    }

    /// Everything else — earlier this week, month, whenever.
    private var earlierConversations: [ConversationStore.Metadata] {
        conversationHistory.filter { !Calendar.current.isDateInToday($0.updatedAt) }
    }

    private func conversationRow(_ meta: ConversationStore.Metadata) -> some View {
        let active = meta.id == currentConversationID
        let hovering = hoveredConversationID == meta.id
        let bg: Color = active
            ? UltronTheme.ink2
            : (hovering ? UltronTheme.ink2.opacity(0.5) : .clear)
        let border: Color = active ? UltronTheme.lineSoft : .clear
        return Button {
            onLoadConversation(meta.id)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(meta.title.isEmpty ? "(uden titel)" : meta.title)
                    .font(.custom(UltronTheme.FontName.serifRoman, size: 14).weight(.medium))
                    .foregroundStyle(UltronTheme.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text("\(meta.messageCount) beskeder · \(relativeAge(meta.updatedAt))")
                    .font(.custom(UltronTheme.FontName.monoRegular, size: 10.5))
                    .tracking(0.6)
                    .foregroundStyle(UltronTheme.textMute)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous).fill(bg)
                    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(border, lineWidth: 1))
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.bottom, 2)
        .onHover { hoveredConversationID = $0 ? meta.id : nil }
        .contextMenu {
            Button("Slet samtale", role: .destructive) {
                onDeleteConversation(meta.id)
            }
        }
    }

    private func relativeAge(_ date: Date) -> String {
        let sec = Int(Date().timeIntervalSince(date))
        if sec < 60 { return "nu" }
        if sec < 3_600 { return "\(sec / 60)m siden" }
        if sec < 86_400 { return "\(sec / 3_600)t siden" }
        if sec < 604_800 { return "\(sec / 86_400)d siden" }
        let df = DateFormatter()
        df.locale = Locale(identifier: "da_DK")
        df.dateFormat = "d. MMM"
        return df.string(from: date)
    }

    private func groupLabel(_ text: String) -> some View {
        Text(text)
            .font(.custom(UltronTheme.FontName.monoRegular, size: 9.5))
            .tracking(1.9).textCase(.uppercase)
            .foregroundStyle(UltronTheme.textFaint)
            .padding(.top, 18).padding(.bottom, 6)
    }

    private var newConversationButton: some View {
        Button {
            session.messages.removeAll()
            composerText = ""
            composerFocused = true
        } label: {
            HStack {
                Text("Ny samtale")
                    .font(.custom(UltronTheme.FontName.sansRegular, size: 13))
                    .foregroundStyle(UltronTheme.text)
                Spacer()
                Text("⌘N")
                    .font(.custom(UltronTheme.FontName.monoRegular, size: 10))
                    .foregroundStyle(UltronTheme.textFaint)
                    .padding(.horizontal, 5).padding(.vertical, 2)
                    .background(
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(UltronTheme.ink3)
                            .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .stroke(UltronTheme.line, lineWidth: 1))
                    )
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(UltronTheme.ink2)
                    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(UltronTheme.lineSoft, lineWidth: 1))
            )
        }
        .buttonStyle(.plain)
    }

    private var activeConversationRow: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(conversationTitle)
                .font(.custom(UltronTheme.FontName.serifRoman, size: 14).weight(.medium))
                .foregroundStyle(UltronTheme.text)
                .lineLimit(2)
            Text(conversationSummary)
                .font(.custom(UltronTheme.FontName.monoRegular, size: 10.5))
                .tracking(0.6).foregroundStyle(UltronTheme.textMute)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(UltronTheme.ink2)
                .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(UltronTheme.lineSoft, lineWidth: 1))
        )
    }

    private var conversationSummary: String {
        let count = session.messages.count
        if count == 0 { return "Ingen beskeder endnu" }
        return "\(count) beskeder"
    }

    // MARK: - Main column

    private var mainColumn: some View {
        VStack(spacing: 0) {
            headerBar
            messageStream
            if session.pendingConfirmation != nil {
                pendingConfirmationCard
                    .padding(.horizontal, 28)
                    .padding(.top, 6)
                    .padding(.bottom, 6)
                    .frame(maxWidth: 880)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .background(UltronTheme.ink)
            }
            composer
        }
    }

    private var headerBar: some View {
        HStack(alignment: .center, spacing: 12) {
            Button(action: toggleSidebar) {
                Image(systemName: sidebarCollapsed
                      ? "sidebar.left"
                      : "sidebar.left.fill")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(UltronTheme.textMute)
                    .frame(width: 26, height: 22)
                    .background(
                        RoundedRectangle(cornerRadius: 5, style: .continuous)
                            .fill(UltronTheme.ink2)
                            .overlay(
                                RoundedRectangle(cornerRadius: 5, style: .continuous)
                                    .stroke(UltronTheme.lineSoft, lineWidth: 1)
                            )
                    )
            }
            .buttonStyle(.plain)
            .help(sidebarCollapsed ? "Vis historik" : "Skjul historik")
            .keyboardShortcut("[", modifiers: .command)

            Text(conversationTitle)
                .font(UltronTheme.Typography.sectionH2())
                .foregroundStyle(UltronTheme.text)
                .lineLimit(1)

            Spacer(minLength: 12)

            liveStatsChip

            if session.isStreaming || usageTracker.isTurnInFlight {
                HStack(spacing: 6) {
                    Circle().fill(UltronTheme.warn).frame(width: 6, height: 6)
                    Text("skriver")
                        .font(.custom(UltronTheme.FontName.monoRegular, size: 10))
                        .tracking(0.8).textCase(.uppercase)
                        .foregroundStyle(UltronTheme.warn)
                }
            }
        }
        .padding(.horizontal, 24).padding(.vertical, 14)
        .background(UltronTheme.ink)
        .overlay(alignment: .bottom) {
            Rectangle().fill(UltronTheme.lineSoft).frame(height: 1)
        }
    }

    /// Live model + tokens + response-time chip. Reads from
    /// `UsageTracker`'s per-turn fields so it updates the moment a
    /// streamed or non-streamed Gemini request resolves.
    private var liveStatsChip: some View {
        HStack(spacing: 10) {
            statItem(icon: "cpu", text: usageTracker.lastModelName ?? "ingen svar endnu")
            if usageTracker.lastInputTokens > 0 || usageTracker.lastOutputTokens > 0 {
                statItem(icon: "arrow.up.arrow.down",
                         text: "\(usageTracker.lastInputTokens) → \(usageTracker.lastOutputTokens)")
            }
            if usageTracker.lastLatencyMs > 0 {
                statItem(icon: "timer", text: "\(usageTracker.lastLatencyMs) ms")
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 5)
        .background(Capsule().fill(UltronTheme.ink2)
            .overlay(Capsule().stroke(UltronTheme.lineSoft, lineWidth: 1)))
    }

    private func statItem(icon: String, text: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(UltronTheme.textFaint)
            Text(text)
                .font(.custom(UltronTheme.FontName.monoRegular, size: 10.5))
                .foregroundStyle(UltronTheme.textMute)
        }
    }

    private var messageStream: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if session.messages.isEmpty {
                        emptyState
                    } else {
                        ForEach(session.messages) { msg in
                            messageRow(msg).id(msg.id)
                        }
                    }
                }
                .frame(maxWidth: 880, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.horizontal, 28).padding(.top, 28).padding(.bottom, 40)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .onChange(of: session.messages.last?.id) { _, newID in
                guard let newID else { return }
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(newID, anchor: .bottom)
                }
            }
        }
    }

    private var emptyState: some View {
        let nickname = UserDefaults.standard.string(forKey: "userNickname") ?? "P"
        let pair = GreetingProvider.random(name: nickname, seed: greetingSeed)
        return VStack(alignment: .leading, spacing: 10) {
            Text(pair.hello)
                .font(.custom(UltronTheme.FontName.serifRoman, size: 40).weight(.light))
                .foregroundStyle(UltronTheme.text)
            Text(pair.line)
                .font(.custom(UltronTheme.FontName.serifItalic, size: 22))
                .foregroundStyle(UltronTheme.textDim)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 12)
    }

    @ViewBuilder
    private func messageRow(_ msg: ChatMessage) -> some View {
        switch msg.role {
        case .user:      userMessage(msg)
        case .assistant: assistantMessage(msg)
        }
    }

    private func monoKicker(_ text: String) -> some View {
        Text(text)
            .font(.custom(UltronTheme.FontName.monoRegular, size: 9.5))
            .tracking(1.9).textCase(.uppercase)
            .foregroundStyle(UltronTheme.textMute)
    }

    private func userMessage(_ msg: ChatMessage) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            monoKicker("Dig · \(Self.timeFormatter.string(from: msg.timestamp))")
            Text(msg.text)
                .font(.custom(UltronTheme.FontName.sansRegular, size: 14.5))
                .foregroundStyle(UltronTheme.text)
                .lineSpacing(3)
                .textSelection(.enabled)
                .padding(.horizontal, 16).padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(UltronTheme.ink2)
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .stroke(UltronTheme.lineSoft, lineWidth: 1))
                )
                .frame(maxWidth: 520, alignment: .leading)
        }
    }

    private func assistantMessage(_ msg: ChatMessage) -> some View {
        let isLastAssistant = session.messages.last?.id == msg.id
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                monoKicker("Ultron · \(Self.timeFormatter.string(from: msg.timestamp))")
                if !session.agentToolInvocations.isEmpty, isLastAssistant {
                    Text("\(session.agentToolInvocations.count) værktøjskald")
                        .font(.custom(UltronTheme.FontName.monoRegular, size: 9.5))
                        .tracking(0.4).foregroundStyle(UltronTheme.textDim)
                        .padding(.horizontal, 7).padding(.vertical, 1)
                        .background(Capsule().fill(UltronTheme.ink2)
                            .overlay(Capsule().stroke(UltronTheme.lineSoft, lineWidth: 1)))
                }
                if msg.lastError != nil {
                    Text("fejl")
                        .font(.custom(UltronTheme.FontName.monoRegular, size: 9.5))
                        .tracking(0.5).textCase(.uppercase)
                        .foregroundStyle(UltronTheme.warn)
                        .padding(.horizontal, 7).padding(.vertical, 1)
                        .background(Capsule().fill(UltronTheme.warn.opacity(0.15))
                            .overlay(Capsule().stroke(UltronTheme.warn.opacity(0.55), lineWidth: 1)))
                }
            }
            if isLastAssistant {
                ForEach(Array(session.agentToolInvocations.enumerated()), id: \.offset) { _, invocation in
                    toolInvocationCard(invocation)
                }
            }
            Text(msg.text.isEmpty && session.isStreaming ? "…" : msg.text)
                .font(.custom(UltronTheme.FontName.serifRoman, size: 16))
                .foregroundStyle(UltronTheme.text)
                .lineSpacing(4)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Agent tool cards + pending confirmation

    private func toolInvocationCard(_ invocation: AgentService.ToolInvocation) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: invocation.success ? "checkmark.circle.fill" : "xmark.octagon.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(invocation.success ? UltronTheme.ok : UltronTheme.warn)
                .frame(width: 24, height: 24)
                .background(
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .fill(UltronTheme.ink3)
                        .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous)
                            .stroke(UltronTheme.line, lineWidth: 1))
                )
            VStack(alignment: .leading, spacing: 2) {
                Text(invocation.name)
                    .font(.custom(UltronTheme.FontName.monoRegular, size: 11))
                    .tracking(0.4).foregroundStyle(UltronTheme.text)
                Text(invocation.inputSummary.isEmpty ? invocation.resultSummary : invocation.inputSummary)
                    .font(.custom(UltronTheme.FontName.monoRegular, size: 10))
                    .foregroundStyle(UltronTheme.textFaint)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text("\(invocation.durationMs) ms")
                .font(.custom(UltronTheme.FontName.monoRegular, size: 10))
                .tracking(0.4).foregroundStyle(UltronTheme.textMute)
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(UltronTheme.ink2)
                .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .stroke(UltronTheme.lineSoft, lineWidth: 1))
        )
    }

    @ViewBuilder
    private var pendingConfirmationCard: some View {
        if let pending = session.pendingConfirmation {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.shield.fill")
                        .foregroundStyle(UltronTheme.warn)
                    Text("Godkend værktøj")
                        .font(.custom(UltronTheme.FontName.monoRegular, size: 10.5))
                        .tracking(1.9).textCase(.uppercase)
                        .foregroundStyle(UltronTheme.warn)
                    Spacer(minLength: 8)
                    Text(pending.toolName)
                        .font(.custom(UltronTheme.FontName.monoRegular, size: 11))
                        .foregroundStyle(UltronTheme.textDim)
                }
                Text(pending.humanSummary)
                    .font(.custom(UltronTheme.FontName.serifRoman, size: 14))
                    .foregroundStyle(UltronTheme.text)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                if !pending.arguments.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(pending.arguments.enumerated()), id: \.offset) { _, pair in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(pair.key)
                                    .font(.custom(UltronTheme.FontName.monoRegular, size: 10))
                                    .foregroundStyle(UltronTheme.textFaint)
                                    .frame(width: 110, alignment: .leading)
                                Text(pair.value)
                                    .font(.custom(UltronTheme.FontName.monoRegular, size: 11))
                                    .foregroundStyle(UltronTheme.text)
                                    .lineLimit(2)
                            }
                        }
                    }
                    .padding(.vertical, 6)
                }
                HStack(spacing: 10) {
                    Spacer()
                    Button(action: onReject) {
                        Text("Afvis")
                            .font(UltronTheme.Typography.bodySemibold(size: 12.5))
                            .foregroundStyle(UltronTheme.text)
                            .padding(.horizontal, 14).padding(.vertical, 6)
                            .background(Capsule()
                                .stroke(UltronTheme.lineSoft, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .keyboardShortcut(.escape, modifiers: [])

                    Button(action: onApprove) {
                        Text("Godkend ⌘⏎")
                            .font(UltronTheme.Typography.bodySemibold(size: 12.5))
                            .foregroundStyle(UltronTheme.ink)
                            .padding(.horizontal, 14).padding(.vertical, 6)
                            .background(Capsule().fill(UltronTheme.warn))
                    }
                    .buttonStyle(.plain)
                    .keyboardShortcut(.return, modifiers: .command)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(UltronTheme.ink2)
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(UltronTheme.warn.opacity(0.6), lineWidth: 1))
            )
        }
    }

    // MARK: - Composer

    private var composer: some View {
        VStack(spacing: 0) {
            Rectangle().fill(UltronTheme.lineSoft).frame(height: 1)
            VStack(alignment: .leading, spacing: 10) {
                ZStack(alignment: .topLeading) {
                    if composerText.isEmpty {
                        Text("Svar, eller tryk ⌥ Retur for at diktere…")
                            .font(.custom(UltronTheme.FontName.sansRegular, size: 14.5))
                            .foregroundStyle(UltronTheme.textFaint)
                            .padding(.vertical, 2).allowsHitTesting(false)
                    }
                    TextField("", text: $composerText, axis: .vertical)
                        .textFieldStyle(.plain)
                        .font(.custom(UltronTheme.FontName.sansRegular, size: 14.5))
                        .foregroundStyle(UltronTheme.text)
                        .lineLimit(2...6)
                        .focused($composerFocused)
                        .onSubmit(submit)
                }
                .frame(minHeight: 40, alignment: .topLeading)

                HStack(spacing: 10) {
                    Spacer(minLength: 8)
                    sendButton
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: UltronTheme.Radius.composer, style: .continuous)
                    .fill(UltronTheme.ink2)
                    .overlay(RoundedRectangle(cornerRadius: UltronTheme.Radius.composer, style: .continuous)
                        .stroke(UltronTheme.lineSoft, lineWidth: 1))
            )
            .frame(maxWidth: 880)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.horizontal, 28).padding(.top, 14).padding(.bottom, 22)
        }
        .background(UltronTheme.ink)
    }

    private var sendButton: some View {
        Button(action: submit) {
            Text("Send ⌘⏎")
                .font(UltronTheme.Typography.bodySemibold(size: 13))
                .foregroundStyle(UltronTheme.ink)
                .padding(.horizontal, 14).padding(.vertical, 6)
                .background(Capsule().fill(canSend ? UltronTheme.paper : UltronTheme.paper.opacity(0.4)))
        }
        .buttonStyle(.plain)
        .disabled(!canSend)
        .keyboardShortcut(.return, modifiers: .command)
    }

    private var canSend: Bool {
        !composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !session.isStreaming
    }

    private func submit() {
        let trimmed = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !session.isStreaming else { return }
        composerText = ""
        onSend(trimmed)
    }

    private static let timeFormatter: DateFormatter = {
        let df = DateFormatter()
        df.dateFormat = "HH:mm"
        return df
    }()
}

#Preview("Ultron Chat — empty") {
    UltronChatView(
        session: nil,
        usageTracker: UsageTracker(),
        onSend: { _ in }
    )
    .frame(width: 1200, height: 780)
}
