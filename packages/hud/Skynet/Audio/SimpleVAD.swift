import AVFoundation
import Foundation

/// RMS-based voice-activity detector. Fires `onSilence` when the mic has been
/// below the noise floor for `silenceWindow` seconds in a row, which the
/// recording pipeline uses to auto-stop after a wake-word-triggered turn.
///
/// Deliberately simple: no WebRTC-VAD dependency, no ML — just a short rolling
/// RMS average versus a fixed threshold. Good enough for Skynet's "one turn,
/// stop when the user finishes a sentence" use-case.
@MainActor
final class SimpleVAD {
    /// RMS threshold in the [0, 1] range. Below this the frame counts as silent.
    /// Tuned on a quiet desk mic; loud offices may want to lower it.
    var silenceFloor: Double = 0.012
    /// Minimum time the user must have been speaking before silence counts as
    /// "done". Prevents the detector from firing during the initial pre-speech
    /// pause on the wake word's own tail.
    var minSpeechDuration: TimeInterval = 0.6
    /// How much continuous silence ends the turn.
    var silenceWindow: TimeInterval = 0.9
    /// Hard cap so the session can't run forever even if the user never stops
    /// talking. Wake-word mode passes a shorter max than push-to-talk.
    var maxDuration: TimeInterval = 25

    var onSilence: (() -> Void)?
    var onMaxDuration: (() -> Void)?

    private var startedAt: Date?
    private var lastVoiceAt: Date?
    private var hasDetectedVoice = false
    private var timer: Timer?

    /// Begin watching a subscriber feed. Call `stop()` when the consumer tears
    /// down; the VAD does not own the audio engine.
    func start() {
        startedAt = Date()
        lastVoiceAt = nil
        hasDetectedVoice = false
        cancelTimer()
        let t = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    func stop() {
        cancelTimer()
        startedAt = nil
        lastVoiceAt = nil
        hasDetectedVoice = false
    }

    /// Called on every audio buffer — RMS in [0, 1]. Safe to call off-main.
    nonisolated func submit(rms: Double) {
        let now = Date()
        Task { @MainActor [weak self] in
            guard let self else { return }
            if rms >= self.silenceFloor {
                self.hasDetectedVoice = true
                self.lastVoiceAt = now
            } else if self.hasDetectedVoice && self.lastVoiceAt == nil {
                self.lastVoiceAt = now
            }
        }
    }

    // MARK: - Private

    private func tick() {
        guard let startedAt else { return }
        let now = Date()
        if now.timeIntervalSince(startedAt) >= maxDuration {
            cancelTimer()
            LoggingService.shared.log("VAD: max duration reached — stopping")
            onMaxDuration?()
            return
        }
        guard hasDetectedVoice, let lastVoice = lastVoiceAt else { return }
        guard now.timeIntervalSince(startedAt) >= minSpeechDuration else { return }
        if now.timeIntervalSince(lastVoice) >= silenceWindow {
            cancelTimer()
            LoggingService.shared.log("VAD: endpoint detected — stopping")
            onSilence?()
        }
    }

    private func cancelTimer() {
        timer?.invalidate()
        timer = nil
    }
}
