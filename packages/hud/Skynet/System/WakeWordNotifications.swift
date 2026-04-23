import Foundation

extension Notification.Name {
    /// Fired when the user toggles the wake-word setting or saves a new AccessKey.
    /// AppDelegate listens and restarts (or stops) the detector accordingly.
    static let skynetWakeWordSettingsChanged = Notification.Name("skynetWakeWordSettingsChanged")

    /// Fired when the continuous "Skynet ..." voice-command toggle flips.
    static let skynetVoiceCommandSettingsChanged = Notification.Name("skynetVoiceCommandSettingsChanged")

    /// Fired when the morning-briefing scheduler is toggled or its time is changed.
    static let skynetMorningBriefingSettingsChanged = Notification.Name("skynetMorningBriefingSettingsChanged")

    /// Fired when the Live Voice toggle flips in Settings — lets AppDelegate
    /// surface a brief status HUD next wake event.
    static let skynetLiveVoiceSettingsChanged = Notification.Name("skynetLiveVoiceSettingsChanged")
}
