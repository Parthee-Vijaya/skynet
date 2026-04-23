import AppKit
import SwiftUI

/// Popover-style cheat sheet listing every bound hotkey + voice command. Opened
/// from the menu bar ("Hotkeys & kommandoer …") or the chat window's help
/// icon. Reads bindings live from `HotkeyBindings` so user edits show up
/// immediately.
struct HotkeyCheatSheet: View {
    let bindings: HotkeyBindings
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Image(systemName: "keyboard")
                    .font(.system(size: 14))
                    .foregroundStyle(SkynetTheme.accent)
                Text("Hotkeys & kommandoer")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(SkynetTheme.textPrimary)
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(SkynetTheme.textSecondary)
                        .frame(width: 22, height: 22)
                        .background(
                            RoundedRectangle(cornerRadius: 5)
                                .fill(SkynetTheme.surfaceElevated)
                        )
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)

            Divider().background(SkynetTheme.hairline)

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    section(title: "Hotkeys") {
                        ForEach(HotkeyAction.allCases, id: \.self) { action in
                            row(label: action.displayName,
                                shortcut: bindings.binding(for: action).displayString)
                        }
                    }

                    section(title: "Voice commands (hvis aktiveret)") {
                        row(label: "Åbn chat",      shortcut: "„Skynet chat“")
                        row(label: "Åbn Cockpit",   shortcut: "„Skynet cockpit / info“")
                        row(label: "Åbn Briefing",  shortcut: "„Skynet briefing / nyheder“")
                        row(label: "Stil spørgsmål", shortcut: "„Skynet spørg …“")
                        row(label: "Oversæt",       shortcut: "„Skynet oversæt …“")
                        row(label: "Opsummer",      shortcut: "„Skynet opsummer …“")
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
        }
        .frame(width: 420, height: 520)
        .background(SkynetTheme.surfaceBase)
        .dynamicTypeSize(.xSmall ... .xxxLarge)
    }

    @ViewBuilder
    private func section<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .font(.caption2.weight(.semibold))
                .foregroundStyle(SkynetTheme.textMuted)
            VStack(alignment: .leading, spacing: 4) { content() }
        }
    }

    private func row(label: String, shortcut: String) -> some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundStyle(SkynetTheme.textPrimary)
            Spacer()
            Text(shortcut)
                .font(.caption2.monospaced())
                .foregroundStyle(SkynetTheme.textSecondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(
                    RoundedRectangle(cornerRadius: 4)
                        .fill(SkynetTheme.surfaceElevated)
                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(SkynetTheme.hairline, lineWidth: 0.5))
                )
        }
        .padding(.vertical, 2)
    }
}
