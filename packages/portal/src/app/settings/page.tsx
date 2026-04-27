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
}

interface ModelsResp {
  available: boolean;
  baseUrl: string;
  models: Array<{ id: string; label?: string; tag?: string }>;
  missing: Array<{ hint: string; label: string; tag: string }>;
  error?: string;
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

        <Section title="llm / lm studio" className="mb-8">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="base url" help="LM Studio's OpenAI-kompatible endpoint (typisk http://localhost:1234/v1)" value={llm.baseUrl} onChange={(v) => setLlm({ ...llm, baseUrl: v })} onReset={() => resetKey("baseUrl")} />
            <Field label="api-nøgle" help="LM Studio ignorerer indholdet — men noget skal stå der." value={llm.apiKey} onChange={(v) => setLlm({ ...llm, apiKey: v })} onReset={() => resetKey("apiKey")} />
            <Field label="default model-id" help="Tom = vælger første tilgængelige. Ellers skal ID matche /v1/models." value={llm.defaultModel} onChange={(v) => setLlm({ ...llm, defaultModel: v })} onReset={() => resetKey("defaultModel")} />

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
                {testing ? "tester…" : "test lm studio"}
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
