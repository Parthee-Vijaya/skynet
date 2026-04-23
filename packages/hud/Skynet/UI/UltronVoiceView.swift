import SwiftUI

// MARK: - Public state model

/// Finite state for the Voice HUD per the Ultron design handoff
/// (`design_handoff_skynet_hud/README.md` → "Screen 2 — Voice HUD").
///
/// This is intentionally decoupled from `HUDState.Phase` so the v2.0 HUD
/// can be dropped into the upcoming `UltronMainWindow` without tripping
/// over the legacy voice flow that still lives in `HUDContentView.swift`.
enum UltronVoiceState: Equatable {
    case idle
    case listening(partial: String, final: String)
    case thinking(query: String)
    case speaking(answer: String, citations: [VoiceCitation])
}

/// Citation chip rendered under the answer in the `.speaking` state.
/// Matches the Gemini grounded-search output (number, host, URL).
struct VoiceCitation: Identifiable, Hashable {
    let id = UUID()
    let number: Int
    let host: String
    let url: URL?

    init(number: Int, host: String, url: URL? = nil) {
        self.number = number
        self.host = host
        self.url = url
    }
}

// MARK: - Voice HUD view

/// The Voice HUD card (Screen 2 in the handoff). Fixed 640pt wide, 22pt
/// radius, `ink2` background with a soft 1pt border. Consumes a
/// `UltronVoiceState` binding plus stylistic waveform amplitudes driven
/// externally (tie into `AudioLevelMonitor`/`WaveformBuffer` later).
///
/// State label colour, hint text, and waveform rendering all pivot on
/// the current case — see `dotColor`, `stateLabel`, `modePill`, and
/// `WaveformStrip` below.
struct UltronVoiceView: View {

    // MARK: Inputs

    @Binding var state: UltronVoiceState
    /// 48 samples in 0…1. If fewer/more are supplied, the strip pads or
    /// trims to fit; this matches the 48-bar target in the handoff.
    var waveform: [Double] = []
    var duration: TimeInterval = 0
    var inputMic: String = "MacBook Air"
    var outputSpeaker: String = "MacBook Air"
    var noiseDB: Int = -42
    var confidencePct: Int = 96
    /// Live per-turn stats — `modelName`, token counts and latency in
    /// ms are pulled from `UsageTracker` after the most recent model
    /// round-trip. Zero / "—" when no turn has completed.
    var modelName: String = "—"
    var inputTokens: Int = 0
    var outputTokens: Int = 0
    var latencyMs: Int = 0
    /// Tapped when the user wants to take the current transcript and
    /// continue the conversation in the Chat tab. Empty = disabled.
    var onSendToChat: (String) -> Void = { _ in }
    /// Current captured transcript. When non-empty the "Send til chat"
    /// handoff button becomes active.
    var liveTranscript: String = ""

    // MARK: Animation state

    /// Drives the blinking accent cursor in the `.listening` transcript.
    @State private var cursorOn = true
    /// Drives the slow 1.4s breathing pulse on the thinking waveform.
    @State private var thinkingPulse = false
    /// Drives the coloured dot pulse in the state-label row.
    @State private var dotPulse = false

    // MARK: Body

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            stateLabelRow
            transcript
            WaveformStrip(
                state: state,
                samples: waveform,
                thinkingPulse: thinkingPulse
            )
            .frame(height: 56)
            footer
            metaRow
        }
        .padding(.top, 38)
        .padding(.horizontal, 44)
        .padding(.bottom, 34)
        .frame(width: 640, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: UltronTheme.Radius.card, style: .continuous)
                .fill(UltronTheme.ink2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: UltronTheme.Radius.card, style: .continuous)
                .stroke(UltronTheme.lineSoft, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.5), radius: 80 / 2, x: 0, y: 30)
        .onAppear {
            // Cursor blink — 0.6s cadence as specified in the handoff.
            withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) {
                cursorOn.toggle()
            }
            // 1.4s breathing pulse shared by the state dot + thinking waveform.
            withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) {
                thinkingPulse.toggle()
                dotPulse.toggle()
            }
        }
    }

    // MARK: - State label row

    private var stateLabelRow: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(dotColor)
                .frame(width: 7, height: 7)
                .scaleEffect(dotPulsing && dotPulse ? 0.7 : 1.0)
                .opacity(dotPulsing && dotPulse ? 0.55 : 1.0)

            Text(stateLabel)
                .font(.custom(UltronTheme.FontName.monoRegular, size: 10.5))
                .tracking(2.52) // 10.5 × 0.24
                .textCase(.uppercase)
                .foregroundStyle(UltronTheme.textDim)

            if let (mode, keycap) = modePill {
                ModePill(label: mode, keycap: keycap)
            }

            Spacer(minLength: 0)
        }
    }

    private var dotColor: Color {
        switch state {
        case .idle:       return UltronTheme.textFaint
        case .listening:  return UltronTheme.accent
        case .thinking:   return UltronTheme.warn
        case .speaking:   return UltronTheme.ok
        }
    }

    private var dotPulsing: Bool {
        if case .idle = state { return false }
        return true
    }

    private var stateLabel: String {
        switch state {
        case .idle:      return "Klar · ⌥ Space"
        case .listening: return "Lytter · DIKTERING  ⌥ Space"
        case .thinking:  return "Tænker · SPØRG · GEMINI  ⌥ Q"
        case .speaking:  return "Taler · SPØRG · GEMINI"
        }
    }

    /// Mode pill content (label + keycap) per state. `.speaking` inherits
    /// from the preceding `.thinking` step and thus keeps `⌥ Q`.
    private var modePill: (String, String)? {
        switch state {
        case .idle:      return nil
        case .listening: return ("DIKTERING", "⌥ Space")
        case .thinking:  return ("SPØRG · GEMINI", "⌥ Q")
        case .speaking:  return ("SPØRG · GEMINI", "⌥ Q")
        }
    }

    // MARK: - Transcript

    @ViewBuilder
    private var transcript: some View {
        Group {
            switch state {
            case .idle:
                idleTranscript
            case let .listening(partial, final):
                listeningTranscript(partial: partial, final: final)
            case let .thinking(query):
                thinkingTranscript(query: query)
            case let .speaking(answer, citations):
                speakingTranscript(answer: answer, citations: citations)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 108, alignment: .topLeading)
    }

    private var idleTranscript: some View {
        // Styled keycaps for ⌥ Space / ⌥ Q inside the hint copy.
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            (
                Text("Hold ")
                + Text(Image(systemName: "option"))
                + Text(" Space for at diktere, eller ")
                + Text(Image(systemName: "option"))
                + Text(" Q for at spørge.")
            )
            .font(.custom(UltronTheme.FontName.serifItalic, size: 28))
            .foregroundStyle(UltronTheme.textFaint)
            .lineSpacing(8)
            Spacer(minLength: 0)
        }
    }

    private func listeningTranscript(partial: String, final: String) -> some View {
        HStack(alignment: .top, spacing: 0) {
            (
                Text(final)
                    .font(.custom(UltronTheme.FontName.serifRoman, size: 28))
                    .foregroundStyle(UltronTheme.text)
                + (
                    final.isEmpty || partial.isEmpty
                        ? Text("")
                        : Text(" ")
                )
                + Text(partial)
                    .font(.custom(UltronTheme.FontName.serifItalic, size: 28))
                    .foregroundStyle(UltronTheme.textDim)
            )
            .lineSpacing(8)

            // 2×26pt blinking accent cursor
            Rectangle()
                .fill(UltronTheme.accent)
                .frame(width: 2, height: 26)
                .padding(.leading, 4)
                .padding(.top, 6)
                .opacity(cursorOn ? 1.0 : 0.0)

            Spacer(minLength: 0)
        }
    }

    private func thinkingTranscript(query: String) -> some View {
        HStack(alignment: .top, spacing: 0) {
            (
                Text(query)
                    .font(.custom(UltronTheme.FontName.serifRoman, size: 28))
                    .foregroundStyle(UltronTheme.text)
                + Text("   ")
                + Text("◌ søger")
                    .font(.custom(UltronTheme.FontName.monoRegular, size: 13))
                    .foregroundStyle(UltronTheme.warn)
            )
            .lineSpacing(8)
            Spacer(minLength: 0)
        }
    }

    private func speakingTranscript(answer: String, citations: [VoiceCitation]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Du spurgte")
                .font(.custom(UltronTheme.FontName.monoRegular, size: 10.5))
                .tracking(2.31) // 10.5 × 0.22 — matches the kicker scale
                .textCase(.uppercase)
                .foregroundStyle(UltronTheme.textFaint)

            Text(answer)
                .font(.custom(UltronTheme.FontName.serifRoman, size: 28))
                .foregroundStyle(UltronTheme.text)
                .lineSpacing(8)
                .fixedSize(horizontal: false, vertical: true)

            if !citations.isEmpty {
                HStack(spacing: 10) {
                    ForEach(citations) { citation in
                        CitationChip(citation: citation)
                    }
                }
            }
        }
    }

    // MARK: - Footer + meta

    private var footer: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(hintText)
                .font(.custom(UltronTheme.FontName.monoRegular, size: 10.5))
                .foregroundStyle(UltronTheme.textMute)
            Spacer(minLength: 12)
            if !liveTranscript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Button {
                    onSendToChat(liveTranscript)
                } label: {
                    HStack(spacing: 6) {
                        Text("Send til chat")
                        Image(systemName: "arrow.turn.up.right")
                    }
                    .font(.custom(UltronTheme.FontName.monoRegular, size: 10.5))
                    .foregroundStyle(UltronTheme.ink)
                    .padding(.horizontal, 9).padding(.vertical, 3)
                    .background(Capsule().fill(UltronTheme.paper))
                }
                .buttonStyle(.plain)
                .help("Fortsæt i chat med den aktuelle transcript")
                .accessibilityLabel("Send til chat")
            }
            Text(formatDuration(duration))
                .font(.custom(UltronTheme.FontName.monoRegular, size: 10.5))
                .monospacedDigit()
                .foregroundStyle(UltronTheme.textMute)
        }
    }

    private var hintText: String {
        switch state {
        case .idle:      return "Hold ⌥ Space for at diktere, eller ⌥ Q for at spørge."
        case .listening: return "Lytter · lokal Whisper large-v3"
        case .thinking:  return "Tænker · websøgning + citater"
        case .speaking:  return "Taler · AVSpeechSynthesizer"
        }
    }

    private var metaRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                metaItem("Mik: \(inputMic)")
                metaDot()
                metaItem("Højtaler: \(outputSpeaker)")
                metaDot()
                metaItem("Støj: \(noiseDB) dB")
                Spacer(minLength: 0)
            }
            HStack(spacing: 10) {
                metaItem("Model: \(modelName)")
                metaDot()
                metaItem("Tokens: \(inputTokens) → \(outputTokens)")
                metaDot()
                metaItem(latencyMs > 0 ? "Svar: \(latencyMs) ms" : "Svar: —")
                Spacer(minLength: 0)
            }
        }
    }

    private func metaItem(_ s: String) -> some View {
        Text(s)
            .font(.custom(UltronTheme.FontName.monoRegular, size: 10.5))
            .foregroundStyle(UltronTheme.textFaint)
    }

    private func metaDot() -> some View {
        Text("·")
            .font(.custom(UltronTheme.FontName.monoRegular, size: 10.5))
            .foregroundStyle(UltronTheme.textFaint.opacity(0.7))
    }

    private func formatDuration(_ t: TimeInterval) -> String {
        let clamped = max(0, t)
        let minutes = Int(clamped) / 60
        let seconds = clamped.truncatingRemainder(dividingBy: 60)
        return String(format: "%d:%04.1f", minutes, seconds)
    }
}

// MARK: - Mode pill

/// Pill + keycap combo for the state-label row. `ink3` rounded pill with
/// a small bordered monospace keycap nested inside — matches the HTML
/// reference exactly.
private struct ModePill: View {
    let label: String
    let keycap: String

    var body: some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.custom(UltronTheme.FontName.monoRegular, size: 10.5))
                .tracking(2.52) // 10.5 × 0.24
                .textCase(.uppercase)
                .foregroundStyle(UltronTheme.textDim)

            Text(keycap)
                .font(.custom(UltronTheme.FontName.monoRegular, size: 10))
                .foregroundStyle(UltronTheme.textDim)
                .padding(.horizontal, 5)
                .padding(.vertical, 1)
                .overlay(
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .stroke(UltronTheme.line, lineWidth: 1)
                )
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule(style: .continuous)
                .fill(UltronTheme.ink3)
        )
    }
}

// MARK: - Citation chip

/// Rounded `ink` pill containing a mono accent number, host label, and
/// an SF Symbol out-arrow glyph. Hover state brightens the border from
/// `lineSoft` to `line` — the same idiom `UltronTile` uses.
private struct CitationChip: View {
    let citation: VoiceCitation

    @State private var hovering = false

    var body: some View {
        HStack(spacing: 6) {
            Text("[\(citation.number)]")
                .font(.custom(UltronTheme.FontName.monoRegular, size: 10))
                .foregroundStyle(UltronTheme.accent)
            Text(citation.host)
                .font(.custom(UltronTheme.FontName.sansRegular, size: 11))
                .foregroundStyle(UltronTheme.text)
            Image(systemName: "arrow.up.right")
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(UltronTheme.textMute)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 3)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(UltronTheme.ink)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .stroke(hovering ? UltronTheme.line : UltronTheme.lineSoft, lineWidth: 1)
                .animation(UltronTheme.hoverEase, value: hovering)
        )
        .onHover { hovering = $0 }
        .onTapGesture {
            if let url = citation.url { NSWorkspace.shared.open(url) }
        }
        .help(citation.url?.absoluteString ?? citation.host)
    }
}

// MARK: - Waveform strip

/// 48-bar full-width waveform. The colour and amplitude model switch
/// per state; callers feed a `[Double]` of 48 values 0…1 and the view
/// re-renders on change. Fewer/more samples are padded/trimmed so the
/// caller can wire any source (Hann envelope, `AudioLevelMonitor`, etc.).
private struct WaveformStrip: View {
    let state: UltronVoiceState
    let samples: [Double]
    let thinkingPulse: Bool

    private static let barCount = 48
    private static let gap: CGFloat = 3
    private static let minBar: CGFloat = 3

    var body: some View {
        GeometryReader { geo in
            let totalGap = CGFloat(Self.barCount - 1) * Self.gap
            let barW = max(1, (geo.size.width - totalGap) / CGFloat(Self.barCount))
            HStack(alignment: .center, spacing: Self.gap) {
                ForEach(0..<Self.barCount, id: \.self) { i in
                    bar(index: i, height: geo.size.height)
                        .frame(width: barW)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .center)
        }
    }

    @ViewBuilder
    private func bar(index: Int, height: CGFloat) -> some View {
        switch state {
        case .idle:
            // Idle still responds to mic — shows live level in a muted
            // colour so the user can verify the tap is alive before
            // pressing to dictate. Falls back to minBar when samples
            // are empty (no audio pipe attached).
            RoundedRectangle(cornerRadius: 1, style: .continuous)
                .fill(UltronTheme.line)
                .frame(height: idleAmplitude(for: index, height: height))
                .animation(.easeOut(duration: 0.08), value: samples)

        case .listening:
            RoundedRectangle(cornerRadius: 1, style: .continuous)
                .fill(UltronTheme.accent)
                .frame(height: amplitude(for: index, height: height))
                .animation(.easeOut(duration: 0.08), value: samples)

        case .thinking:
            RoundedRectangle(cornerRadius: 1, style: .continuous)
                .fill(UltronTheme.warn)
                .frame(height: thinkingHeight(height: height))

        case .speaking:
            RoundedRectangle(cornerRadius: 1, style: .continuous)
                .fill(UltronTheme.ok)
                .frame(height: speakingHeight(index: index, height: height))
        }
    }

    /// Idle bar height — same per-sample lookup as `.listening` but
    /// capped at ~60% of strip height so the HUD reads as "quiet /
    /// waiting" rather than "active capture".
    private func idleAmplitude(for index: Int, height: CGFloat) -> CGFloat {
        if samples.isEmpty { return Self.minBar }
        let scaled = Double(index) * Double(samples.count - 1) / Double(Self.barCount - 1)
        let clamped = max(0, min(Double(samples.count - 1), scaled))
        let sample = samples[Int(clamped.rounded())]
        let amp = CGFloat(max(0, min(1, sample)))
        return max(Self.minBar, amp * height * 0.6)
    }

    /// Listening: pull from caller-supplied samples, falling back to a
    /// small Hann-window envelope so the strip never looks dead if the
    /// audio pipe isn't wired yet.
    private func amplitude(for index: Int, height: CGFloat) -> CGFloat {
        let sample: Double
        if !samples.isEmpty {
            let scaled = Double(index) * Double(samples.count - 1) / Double(Self.barCount - 1)
            let clamped = max(0, min(Double(samples.count - 1), scaled))
            sample = samples[Int(clamped.rounded())]
        } else {
            // Fallback Hann envelope so the strip has shape at design time.
            let t = Double(index) / Double(Self.barCount - 1)
            sample = 0.5 * (1 - cos(2 * .pi * t))
        }
        let amp = CGFloat(max(0, min(1, sample)))
        return max(Self.minBar, amp * height)
    }

    /// Thinking: uniform slow breath — all bars scale together between
    /// `minBar` and ~35% of the strip height.
    private func thinkingHeight(height: CGFloat) -> CGFloat {
        let base = height * 0.14
        let peak = height * 0.35
        return thinkingPulse ? peak : base
    }

    /// Speaking: staggered ripple. Each bar lags its neighbour by ~30ms,
    /// mirroring the HTML's left-to-right travelling wave. We encode the
    /// phase as a time-based sinusoid so SwiftUI's auto-animation driver
    /// keeps it smooth without a per-bar `Timer`.
    private func speakingHeight(index: Int, height: CGFloat) -> CGFloat {
        let phase = Double(index) * 0.15
        let t = Date().timeIntervalSinceReferenceDate * 2.2
        let sample = 0.5 + 0.45 * sin(t - phase)
        return max(Self.minBar, CGFloat(sample) * height)
    }
}

// MARK: - Preview

#Preview("Idle") {
    PreviewHost(initial: .idle)
        .padding(40)
        .background(UltronTheme.rootBackground)
}

#Preview("Listening") {
    PreviewHost(
        initial: .listening(
            partial: "er rykket til torsdag",
            final: "Send en besked til design-teamet om at pendler-gennemgangen"
        ),
        waveform: PreviewHost.demoWaveform(),
        duration: 4.2
    )
    .padding(40)
    .background(UltronTheme.rootBackground)
}

#Preview("Thinking") {
    PreviewHost(
        initial: .thinking(query: "Hvor meget koster en billet fra Østerport til Lyngby i myldretiden?"),
        duration: 1.1
    )
    .padding(40)
    .background(UltronTheme.rootBackground)
}

#Preview("Speaking") {
    PreviewHost(
        initial: .speaking(
            answer: "En enkeltbillet koster 36 kr i myldretiden. Rejsekort reducerer det til 24 kr.",
            citations: [
                VoiceCitation(number: 1, host: "rejseplanen.dk", url: URL(string: "https://rejseplanen.dk")),
                VoiceCitation(number: 2, host: "dot.dk", url: URL(string: "https://dot.dk")),
                VoiceCitation(number: 3, host: "din-offentlige.dk", url: URL(string: "https://din-offentlige.dk"))
            ]
        ),
        duration: 7.3
    )
    .padding(40)
    .background(UltronTheme.rootBackground)
}

/// Small preview wrapper — holds the `@State` so the real view can take
/// a `@Binding` (its production contract) while previews still compile.
private struct PreviewHost: View {
    @State var state: UltronVoiceState
    var waveform: [Double] = []
    var duration: TimeInterval = 0

    init(initial: UltronVoiceState, waveform: [Double] = [], duration: TimeInterval = 0) {
        _state = State(initialValue: initial)
        self.waveform = waveform
        self.duration = duration
    }

    var body: some View {
        UltronVoiceView(
            state: $state,
            waveform: waveform,
            duration: duration
        )
    }

    static func demoWaveform() -> [Double] {
        // Hann-window envelope × per-bar pseudo-random amplitude. This is
        // the stylistic target from the handoff; a real capture will
        // replace it via `AudioLevelMonitor`.
        (0..<48).map { i in
            let t = Double(i) / 47.0
            let env = 0.5 * (1 - cos(2 * .pi * t))
            let jitter = 0.5 + 0.5 * sin(Double(i) * 1.37)
            return env * jitter
        }
    }
}
