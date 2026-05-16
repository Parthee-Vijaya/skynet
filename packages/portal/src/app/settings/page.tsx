"use client";
import { useEffect, useState } from "react";
import type { LLMConfig, LocationSetting } from "@/lib/settings";
import { MinimalPageLayout } from "@/components/minimal/MinimalPageLayout";
import { Section } from "@/components/minimal/primitives";
import { Button } from "@/components/ui/Button";

interface SettingsResp {
  llm: LLMConfig;
  defaults: LLMConfig;
  userName: string;
  location: LocationSetting;
  githubUser?: string;
  hasGithubToken?: boolean;
  sonarrUrl?: string;
  hasSonarrApiKey?: boolean;
  radarrUrl?: string;
  hasRadarrApiKey?: boolean;
}

interface ModelsResp {
  available: boolean;
  provider?: string;
  baseUrl: string;
  models: Array<{ id: string; label?: string; tag?: string }>;
  missing: Array<{ hint: string; label: string; tag: string }>;
  error?: string;
}

function detectProviderName(baseUrl: string): string {
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1?\])/i.test(baseUrl)) return "LM Studio";
  if (baseUrl.includes("generativelanguage.googleapis.com")) return "Gemini";
  if (baseUrl.includes("openai.com")) return "OpenAI";
  if (baseUrl.includes("anthropic.com")) return "Anthropic";
  return "forbindelse";
}

const inputStyle = {
  width: "100%",
  background: "#111",
  border: "1px dashed #262626",
  padding: "6px 10px",
  color: "#e5e5e5",
  fontFamily: "inherit",
  fontSize: 12,
  outline: "none",
} as const;

export default function SettingsPage() {
  const [llm, setLlm] = useState<LLMConfig | null>(null);
  const [defaults, setDefaults] = useState<LLMConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<ModelsResp | null>(null);
  const [testing, setTesting] = useState(false);

  // Profile
  const [userName, setUserName] = useState("");
  const [city, setCity] = useState("");
  const [githubUser, setGithubUser] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [hasGithubToken, setHasGithubToken] = useState(false);
  const [locationLabel, setLocationLabel] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);
  const [profileError, setProfileError] = useState("");

  // Media-stack
  const [sonarrUrl, setSonarrUrl] = useState("");
  const [sonarrApiKey, setSonarrApiKey] = useState("");
  const [hasSonarrApiKey, setHasSonarrApiKey] = useState(false);
  const [radarrUrl, setRadarrUrl] = useState("");
  const [radarrApiKey, setRadarrApiKey] = useState("");
  const [hasRadarrApiKey, setHasRadarrApiKey] = useState(false);
  const [savingMedia, setSavingMedia] = useState(false);
  const [savedMedia, setSavedMedia] = useState(false);
  const [mediaError, setMediaError] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: SettingsResp) => {
        setLlm(data.llm);
        setDefaults(data.defaults);
        setUserName(data.userName ?? "");
        setGithubUser(data.githubUser ?? "");
        setHasGithubToken(!!data.hasGithubToken);
        setLocationLabel(data.location?.label ?? "");
        setSonarrUrl(data.sonarrUrl ?? "");
        setHasSonarrApiKey(!!data.hasSonarrApiKey);
        setRadarrUrl(data.radarrUrl ?? "");
        setHasRadarrApiKey(!!data.hasRadarrApiKey);
      })
      .catch(() => {});
  }, []);

  const saveProfile = async () => {
    setSavingProfile(true); setSavedProfile(false); setProfileError("");
    try {
      const body: Record<string, string> = {};
      if (userName.trim()) body.userName = userName.trim();
      if (city.trim()) body.city = city.trim();
      // Altid send githubUser (kan være tom → fjernes)
      body.githubUser = githubUser.trim();
      // Send token hvis brugeren har indtastet en ny — tom = uændret
      if (githubToken.trim()) body.githubToken = githubToken.trim();
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json() as { ok: boolean; error?: string; location?: LocationSetting; hasGithubToken?: boolean };
      if (!res.ok || !json.ok) {
        setProfileError(json.error ?? "Fejl ved gem");
      } else {
        setSavedProfile(true);
        if (json.location?.label) setLocationLabel(json.location.label);
        if (typeof json.hasGithubToken === "boolean") setHasGithubToken(json.hasGithubToken);
        setCity("");
        setGithubToken("");
        setTimeout(() => setSavedProfile(false), 2000);
      }
    } finally { setSavingProfile(false); }
  };

  const saveMedia = async () => {
    setSavingMedia(true); setSavedMedia(false); setMediaError("");
    try {
      const body: Record<string, string> = {
        sonarrUrl: sonarrUrl.trim(),
        radarrUrl: radarrUrl.trim(),
      };
      if (sonarrApiKey.trim()) body.sonarrApiKey = sonarrApiKey.trim();
      if (radarrApiKey.trim()) body.radarrApiKey = radarrApiKey.trim();
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json() as { ok: boolean; error?: string; hasSonarrApiKey?: boolean; hasRadarrApiKey?: boolean };
      if (!res.ok || !json.ok) {
        setMediaError(json.error ?? "Fejl ved gem");
      } else {
        setSavedMedia(true);
        if (typeof json.hasSonarrApiKey === "boolean") setHasSonarrApiKey(json.hasSonarrApiKey);
        if (typeof json.hasRadarrApiKey === "boolean") setHasRadarrApiKey(json.hasRadarrApiKey);
        setSonarrApiKey("");
        setRadarrApiKey("");
        setTimeout(() => setSavedMedia(false), 2000);
      }
    } finally { setSavingMedia(false); }
  };

  const save = async () => {
    if (!llm) return;
    setSaving(true); setSaved(false);
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ llm }) });
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    } finally { setSaving(false); }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/chat/models", { cache: "no-store" });
      setTest((await res.json()) as ModelsResp);
    } catch (e) {
      setTest({ available: false, baseUrl: llm?.baseUrl ?? "", models: [], missing: [], error: e instanceof Error ? e.message : "unknown" });
    } finally { setTesting(false); }
  };

  const resetKey = (key: keyof LLMConfig) => {
    if (!llm || !defaults) return;
    setLlm({ ...llm, [key]: defaults[key] });
  };

  if (!llm) {
    return (
      <MinimalPageLayout active="settings">
        <div style={{ color: "#6b6b6b", padding: 40, fontFamily: "inherit", fontSize: 12 }}>indlæser indstillinger…</div>
      </MinimalPageLayout>
    );
  }

  return (
    <MinimalPageLayout active="settings">
      <main style={{ maxWidth: 700, margin: "0 auto", padding: "28px 24px 60px", fontFamily: "inherit" }}>

        {/* ── Profil ──────────────────────────────────────────────────────── */}
        <Section title="profil" className="mb-8">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginBottom: 4 }}>navn</div>
                <input
                  type="text"
                  value={userName}
                  placeholder="fx Parthee"
                  onChange={(e) => setUserName(e.target.value)}
                  style={{ ...inputStyle }}
                />
                <div style={{ color: "#444", fontSize: 10, marginTop: 3 }}>Vises i velkomst-hilsen på dashboardet</div>
              </div>
              <div>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginBottom: 4 }}>
                  by (vejr)
                  {locationLabel && <span style={{ color: "#444", marginLeft: 6 }}>· nu: {locationLabel}</span>}
                </div>
                <input
                  type="text"
                  value={city}
                  placeholder={locationLabel || "fx København"}
                  onChange={(e) => setCity(e.target.value)}
                  style={{ ...inputStyle }}
                />
                <div style={{ color: "#444", fontSize: 10, marginTop: 3 }}>Bruges til vejr- og energidata. Geocodes automatisk.</div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginBottom: 4 }}>GitHub-brugernavn</div>
                <input
                  type="text"
                  value={githubUser}
                  placeholder="fx octocat"
                  onChange={(e) => setGithubUser(e.target.value)}
                  style={{ ...inputStyle }}
                />
                <div style={{ color: "#444", fontSize: 10, marginTop: 3 }}>
                  Aktiverer GitHub-widget på cockpittet (stars, commits, 30-dages heatmap, seneste aktivitet). Tom = skjult.
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginBottom: 4 }}>
                  GitHub PAT (valgfri)
                  {hasGithubToken && <span style={{ color: "#7dd67d", marginLeft: 6 }}>· gemt</span>}
                </div>
                <input
                  type="password"
                  value={githubToken}
                  placeholder={hasGithubToken ? "(token gemt — indtast for at ændre)" : "ghp_…"}
                  onChange={(e) => setGithubToken(e.target.value)}
                  style={{ ...inputStyle }}
                  autoComplete="off"
                />
                <div style={{ color: "#444", fontSize: 10, marginTop: 3 }}>
                  Hæver rate-limit (60→5000/t for personal, 10→30/min for trending) og viser
                  events fra private repos. {" "}
                  <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" style={{ color: "#525252" }}>github.com/settings/tokens</a>
                  {" "}· scope: "repo" hvis du vil se private commits, ellers "public_repo".
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Button size="sm" onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? "gemmer…" : "→ gem profil"}
              </Button>
              {savedProfile && <span style={{ color: "#7dd67d", fontSize: 11 }}>✓ gemt</span>}
              {profileError && <span style={{ color: "#d87373", fontSize: 11 }}>{profileError}</span>}
            </div>
          </div>
        </Section>

        {/* ── Media-stack (Sonarr + Radarr) ────────────────────────────────── */}
        <Section title="media-stack" className="mb-8">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ color: "#6b6b6b", fontSize: 11, lineHeight: 1.6 }}>
              Sonarr (serier) + Radarr (film) bruges af watchlist-siden til at
              tilføje + monitorere. Skynet auto-læser API-keys fra
              <code style={{ color: "#444", margin: "0 4px" }}>~/.config/Sonarr/config.xml</code>
              og <code style={{ color: "#444" }}>~/Library/Application Support/Radarr/config.xml</code>
              — sæt kun manuelt her hvis Sonarr/Radarr er på en anden maskine.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginBottom: 4 }}>Sonarr URL</div>
                <input
                  type="text"
                  value={sonarrUrl}
                  placeholder="http://localhost:8989"
                  onChange={(e) => setSonarrUrl(e.target.value)}
                  style={{ ...inputStyle }}
                />
              </div>
              <div>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginBottom: 4 }}>
                  Sonarr API-nøgle
                  {hasSonarrApiKey && <span style={{ color: "#7dd67d", marginLeft: 6 }}>· gemt</span>}
                </div>
                <input
                  type="password"
                  value={sonarrApiKey}
                  placeholder={hasSonarrApiKey ? "(gemt — indtast for at ændre)" : "auto-læses fra config.xml"}
                  onChange={(e) => setSonarrApiKey(e.target.value)}
                  style={{ ...inputStyle }}
                  autoComplete="off"
                />
              </div>
              <div>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginBottom: 4 }}>Radarr URL</div>
                <input
                  type="text"
                  value={radarrUrl}
                  placeholder="http://localhost:7878"
                  onChange={(e) => setRadarrUrl(e.target.value)}
                  style={{ ...inputStyle }}
                />
              </div>
              <div>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginBottom: 4 }}>
                  Radarr API-nøgle
                  {hasRadarrApiKey && <span style={{ color: "#7dd67d", marginLeft: 6 }}>· gemt</span>}
                </div>
                <input
                  type="password"
                  value={radarrApiKey}
                  placeholder={hasRadarrApiKey ? "(gemt — indtast for at ændre)" : "auto-læses fra config.xml"}
                  onChange={(e) => setRadarrApiKey(e.target.value)}
                  style={{ ...inputStyle }}
                  autoComplete="off"
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Button size="sm" onClick={saveMedia} disabled={savingMedia}>
                {savingMedia ? "gemmer…" : "→ gem media"}
              </Button>
              {savedMedia && <span style={{ color: "#7dd67d", fontSize: 11 }}>✓ gemt</span>}
              {mediaError && <span style={{ color: "#d87373", fontSize: 11 }}>{mediaError}</span>}
            </div>
          </div>
        </Section>

        <Section title="llm / provider" className="mb-8">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <ProviderPresets
              currentBaseUrl={llm.baseUrl}
              onPick={(preset) => setLlm({ ...llm, baseUrl: preset.baseUrl, defaultModel: preset.defaultModel, apiKey: preset.apiKey ?? llm.apiKey })}
            />
            <Field label="base url" help="LM Studio's OpenAI-kompatible endpoint (typisk http://localhost:1234/v1) eller Gemini-OpenAI-mode (https://generativelanguage.googleapis.com/v1beta/openai/)" value={llm.baseUrl} onChange={(v) => setLlm({ ...llm, baseUrl: v })} onReset={() => resetKey("baseUrl")} />
            <Field label="api-nøgle" help="LM Studio ignorerer indholdet. Gemini: din API-nøgle fra aistudio.google.com/apikey." value={llm.apiKey} onChange={(v) => setLlm({ ...llm, apiKey: v })} onReset={() => resetKey("apiKey")} />
            <Field label="default model-id" help="Tom = vælger første tilgængelige. Gemini: 'gemini-2.5-flash' (hurtig) eller 'gemini-2.5-pro' (kraftigst)." value={llm.defaultModel} onChange={(v) => setLlm({ ...llm, defaultModel: v })} onReset={() => resetKey("defaultModel")} />

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#6b6b6b", fontSize: 11 }}>system-prompt</span>
                <button onClick={() => resetKey("systemPrompt")} style={{ background: "none", border: "none", color: "#6b6b6b", fontSize: 11, cursor: "pointer" }}>nulstil</button>
              </div>
              <textarea
                value={llm.systemPrompt}
                onChange={(e) => setLlm({ ...llm, systemPrompt: e.target.value })}
                rows={4}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", color: "#e5e5e5" }}>
              <input type="checkbox" checked={llm.verbose} onChange={(e) => setLlm({ ...llm, verbose: e.target.checked })} />
              vis verbose metrics som default (TTFT, tokens, t/s)
            </label>

            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 4 }}>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? "gemmer…" : "→ gem"}
              </Button>
              {saved && <span style={{ color: "#7dd67d", fontSize: 11 }}>✓ gemt</span>}
              <div style={{ flex: 1 }} />
              <Button size="sm" tone="accent" onClick={runTest} disabled={testing}>
                {testing ? "tester…" : `test ${detectProviderName(llm.baseUrl).toLowerCase()}`}
              </Button>
            </div>

            {test && (
              <div style={{ border: `1px dashed ${test.available ? "#2a4a2a" : "#4a2a2a"}`, padding: "10px 14px", fontSize: 11, fontFamily: "inherit" }}>
                <div style={{ color: test.available ? "#7dd67d" : "#d87373" }}>
                  {test.available ? "✓ forbundet" : "✗ kunne ikke forbinde"} · {test.baseUrl}
                </div>
                {test.error && <div style={{ color: "#6b6b6b", marginTop: 4 }}>fejl: {test.error}</div>}
                {test.available && (
                  <>
                    <div style={{ color: "#6b6b6b", marginTop: 8 }}>loadede modeller ({test.models.length}):</div>
                    {test.models.map((m) => (
                      <div key={m.id} style={{ color: "#e5e5e5", marginTop: 2 }}>
                        · {m.id}{m.label && <span style={{ color: "#6b6b6b" }}> — {m.label}</span>}
                      </div>
                    ))}
                    {test.missing.length > 0 && (
                      <>
                        <div style={{ color: "#e6b450", marginTop: 8 }}>forventede, men ikke loaded:</div>
                        {test.missing.map((m) => (
                          <div key={m.hint} style={{ color: "#e6b45066", marginTop: 2 }}>· {m.label}</div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </Section>
      </main>
    </MinimalPageLayout>
  );
}

interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  apiKey?: string;        // Forudfyld kun hvis provider ikke kræver hemmelighed
  hint: string;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "lm-studio",
    label: "LM Studio (lokal)",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "",
    apiKey: "lm-studio",
    hint: "Kører lokalt — ingen netværk, ingen API-nøgle krævet.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-2.5-flash",
    hint: "Hent gratis nøgle på aistudio.google.com/apikey. Indsæt nøglen i feltet 'api-nøgle' nedenunder.",
  },
];

function ProviderPresets({
  currentBaseUrl,
  onPick,
}: {
  currentBaseUrl: string;
  onPick: (preset: ProviderPreset) => void;
}) {
  const activeId =
    PROVIDER_PRESETS.find((p) => currentBaseUrl.startsWith(p.baseUrl) || p.baseUrl.startsWith(currentBaseUrl))?.id
    ?? "custom";
  const activePreset = PROVIDER_PRESETS.find((p) => p.id === activeId);
  return (
    <div>
      <div style={{ color: "#6b6b6b", fontSize: 11, marginBottom: 6 }}>provider</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PROVIDER_PRESETS.map((p) => {
          const isActive = activeId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              style={{
                background: isActive ? "#1a2a3a" : "#0d0d0d",
                border: `1px dashed ${isActive ? "#3a6a9a" : "#262626"}`,
                color: isActive ? "#9bd0ff" : "#9b9b9b",
                fontFamily: "inherit",
                fontSize: 12,
                padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              {isActive ? "● " : "○ "}{p.label}
            </button>
          );
        })}
        <span style={{
          background: activeId === "custom" ? "#1a2a3a" : "transparent",
          border: `1px dashed ${activeId === "custom" ? "#3a6a9a" : "#262626"}`,
          color: activeId === "custom" ? "#9bd0ff" : "#525252",
          fontSize: 12,
          padding: "6px 12px",
          fontStyle: "italic",
        }}>
          {activeId === "custom" ? "● custom" : "○ custom"}
        </span>
      </div>
      {activePreset?.hint && (
        <div style={{ color: "#525252", fontSize: 10, marginTop: 6 }}>{activePreset.hint}</div>
      )}
    </div>
  );
}

function Field({ label, help, value, onChange, onReset }: { label: string; help?: string; value: string; onChange: (v: string) => void; onReset?: () => void; }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: "#6b6b6b", fontSize: 11 }}>{label}</span>
        {onReset && <button onClick={onReset} style={{ background: "none", border: "none", color: "#6b6b6b", fontSize: 11, cursor: "pointer" }}>nulstil</button>}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", background: "#111", border: "1px dashed #262626", padding: "6px 10px", color: "#e5e5e5", fontFamily: "inherit", fontSize: 12, outline: "none" }}
      />
      {help && <div style={{ color: "#444", fontSize: 10, marginTop: 3 }}>{help}</div>}
    </div>
  );
}
