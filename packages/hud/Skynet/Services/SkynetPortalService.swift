import Foundation

/// Tynd HTTP-klient til Skynet portal's `/api/siri`-endpoint. Gør HUD's voice-
/// command flow i stand til at routere brugerens ytring igennem portal-LLM'en
/// (LM Studio eller Gemini) med adgang til alle Skynet's tools — vejret,
/// rejseplanen, dmi-varsler, get_news, find_train_route m.fl.
///
/// Der er ingen auth fordi /api/siri er åben for localhost-clients (samme
/// kontrakt som Apple Shortcut). Endpoint returnerer plain text på max ~500
/// tegn så det kan vises direkte i HUD's `.result`-fase.
@MainActor
final class SkynetPortalService {
    static let shared = SkynetPortalService()

    /// Override via Settings hvis Skynet ikke kører på 3100 (sjældent).
    var baseURL: URL = URL(string: "http://localhost:3100")!

    enum PortalError: LocalizedError {
        case emptyPrompt
        case http(Int, String)
        case transport(String)

        var errorDescription: String? {
            switch self {
            case .emptyPrompt: return "Ingen prompt opfanget."
            case .http(let code, let body): return "Portal HTTP \(code): \(body.prefix(120))"
            case .transport(let msg): return "Portal-fejl: \(msg)"
            }
        }
    }

    /// Send `prompt` til /api/siri og returnér portalens plain-text svar.
    /// Bruger en kort timeout — HUD skal ikke hænge i 60 sek hvis LLM'en er
    /// nede; brugeren får hellere en "fejl" og kan prøve igen.
    func askSiri(prompt: String, timeout: TimeInterval = 30) async throws -> String {
        let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw PortalError.emptyPrompt }

        var url = baseURL
        url.append(path: "/api/siri")
        var req = URLRequest(url: url, timeoutInterval: timeout)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["q": trimmed])

        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                throw PortalError.transport("ikke HTTP-svar")
            }
            let body = String(data: data, encoding: .utf8) ?? ""
            guard (200..<300).contains(http.statusCode) else {
                throw PortalError.http(http.statusCode, body)
            }
            return body.trimmingCharacters(in: .whitespacesAndNewlines)
        } catch let err as PortalError {
            throw err
        } catch {
            throw PortalError.transport(error.localizedDescription)
        }
    }
}
