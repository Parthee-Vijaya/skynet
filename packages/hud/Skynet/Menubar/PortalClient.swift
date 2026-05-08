import Foundation

/// Fælles HTTP-klient for menubar-status-items. Adskilt fra `SkynetPortalService`
/// (som er specifikt til /api/siri) — denne håndterer GET-requests til Skynet
/// portal's read-only-endpoints og JSON-decoding til typed structs.
///
/// Auth: portal'en accepterer same-origin localhost requests uden bearer (auth.ts
/// :46-90), men native Swift-app sender ikke Origin/Referer headers. Vi sender
/// derfor `Authorization: Bearer <control_token>` hvor token læses fra
/// `~/Desktop/Claude/projekter/aktive/skynet/packages/portal/data/skynet.db` via
/// `sqlite3`-shell-out ved boot, og caches i UserDefaults.
@MainActor
final class PortalClient {
    static let shared = PortalClient()

    /// Portal-base, kan overrides via UserDefaults["menubar.portalUrl"]
    var baseURL: URL {
        let s = UserDefaults.standard.string(forKey: "menubar.portalUrl") ?? "http://localhost:3100"
        return URL(string: s) ?? URL(string: "http://localhost:3100")!
    }

    /// Cached control-token. Loades én gang ved boot (loadToken) og refreshes
    /// kun hvis 401 modtages.
    private var cachedToken: String?

    enum ClientError: Error, LocalizedError {
        case noToken
        case http(Int)
        case transport(String)

        var errorDescription: String? {
            switch self {
            case .noToken: return "Skynet control-token ikke tilgængelig"
            case .http(let code): return "Portal HTTP \(code)"
            case .transport(let msg): return "Transport: \(msg.prefix(120))"
            }
        }
    }

    private init() {
        cachedToken = UserDefaults.standard.string(forKey: "menubar.controlToken")
    }

    // MARK: - Token loading

    /// Læs control_token fra Skynet's SQLite-database. Kaldes ved app-boot.
    /// Best-effort: hvis sqlite3 ikke findes eller DB ikke er der, lader vi
    /// tokenet være tomt — endpoints der ikke kræver auth (samtidig same-origin)
    /// vil stadig svare hvis baseURL peger lokalt.
    func loadToken() async {
        // Prøv kendt sti først
        let candidates = [
            FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(
                "Desktop/Claude/projekter/aktive/skynet/packages/portal/data/skynet.db"
            ),
            FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(
                "Desktop/Claude/projekter/skynet/packages/portal/data/skynet.db"
            ),
        ]
        for url in candidates {
            guard FileManager.default.fileExists(atPath: url.path) else { continue }
            if let token = await readTokenFromDB(at: url.path) {
                cachedToken = token
                UserDefaults.standard.set(token, forKey: "menubar.controlToken")
                return
            }
        }
    }

    private func readTokenFromDB(at path: String) async -> String? {
        await withCheckedContinuation { continuation in
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/usr/bin/sqlite3")
            task.arguments = [path, "SELECT value FROM settings WHERE key='control_token'"]
            let pipe = Pipe()
            task.standardOutput = pipe
            task.standardError = Pipe()
            do {
                try task.run()
                task.waitUntilExit()
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let token = String(data: data, encoding: .utf8)?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                continuation.resume(returning: token?.isEmpty == false ? token : nil)
            } catch {
                continuation.resume(returning: nil)
            }
        }
    }

    // MARK: - GET request

    /// GET decoded JSON fra portal. Tilføjer Bearer token automatisk hvis
    /// vi har én. Kaster ClientError ved fejl.
    func get<T: Decodable>(_ path: String, timeout: TimeInterval = 8) async throws -> T {
        let url = baseURL.appendingPathComponent(path.hasPrefix("/") ? String(path.dropFirst()) : path)
        var req = URLRequest(url: url, timeoutInterval: timeout)
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = cachedToken, !token.isEmpty {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                throw ClientError.transport("ikke HTTP-svar")
            }
            // Hvis 401: prøv at re-load token og retry én gang (token kan være rotateret)
            if http.statusCode == 401 && cachedToken != nil {
                await loadToken()
                if let newToken = cachedToken, !newToken.isEmpty {
                    var retry = req
                    retry.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
                    let (d2, r2) = try await URLSession.shared.data(for: retry)
                    if let h2 = r2 as? HTTPURLResponse, (200..<300).contains(h2.statusCode) {
                        return try JSONDecoder().decode(T.self, from: d2)
                    }
                }
            }
            guard (200..<300).contains(http.statusCode) else {
                throw ClientError.http(http.statusCode)
            }
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            return try decoder.decode(T.self, from: data)
        } catch let err as ClientError {
            throw err
        } catch {
            throw ClientError.transport(error.localizedDescription)
        }
    }
}
