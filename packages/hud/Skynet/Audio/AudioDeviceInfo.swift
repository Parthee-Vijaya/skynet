import CoreAudio
import Foundation

/// Queries the current system-default input + output audio devices via
/// CoreAudio HAL. Used by the Ultron Voice HUD to show the actual
/// microphone / speaker names in the meta row.
///
/// Values update when the user picks a different device in System
/// Settings → Sound; callers poll `currentInputName()` +
/// `currentOutputName()` on a short timer.
enum AudioDeviceInfo {

    static func currentInputName() -> String? {
        deviceName(for: defaultDevice(selector: kAudioHardwarePropertyDefaultInputDevice))
    }

    static func currentOutputName() -> String? {
        deviceName(for: defaultDevice(selector: kAudioHardwarePropertyDefaultOutputDevice))
    }

    // MARK: - HAL helpers

    private static func defaultDevice(selector: AudioObjectPropertySelector) -> AudioDeviceID {
        var deviceID: AudioDeviceID = 0
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        var address = AudioObjectPropertyAddress(
            mSelector: selector,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        let status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &address,
            0,
            nil,
            &size,
            &deviceID
        )
        return status == noErr ? deviceID : 0
    }

    private static func deviceName(for id: AudioDeviceID) -> String? {
        guard id != 0 else { return nil }
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioObjectPropertyName,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        var name: Unmanaged<CFString>?
        let status = withUnsafeMutablePointer(to: &name) { ptr -> OSStatus in
            AudioObjectGetPropertyData(id, &address, 0, nil, &size, ptr)
        }
        guard status == noErr, let managed = name else { return nil }
        return managed.takeRetainedValue() as String
    }
}
