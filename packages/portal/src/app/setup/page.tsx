"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Detection {
  key: string;
  name: string;
  status: "ok" | "missing" | "partial";
  details?: string;
  hint?: string;
  feature: string;
}

interface Profile {
  name: string;
  location: { lat: number; lng: number; label: string };
}

interface SetupResp {
  detections: Detection[];
  summary: { ok: number; partial: number; missing: number; total: number };
  profile: Profile;
  at: string;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const S = {
  ok:      { dot: "#7dd67d", label: "ok",     row: "rgba(125,214,125,0.04)", border: "rgba(125,214,125,0.15)" },
  partial: { dot: "#e6b450", label: "delvis",  row: "rgba(230,180,80,0.04)",  border: "rgba(230,180,80,0.15)" },
  missing: { dot: "#d87373", label: "mangler", row: "rgba(216,115,115,0.04)", border: "rgba(216,115,115,0.15)" },
} satisfies Record<Detection["status"], { dot: string; label: string; row: string; border: string }>;

const INPUT: React.CSSProperties = {
  width: "100%",
  background: "#111",
  border: "1px dashed #333",
  padding: "8px 12px",
  color: "#e5e5e5",
  fontFamily: MONO,
  fontSize: 13,
  outline: "none",
  borderRadius: 0,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const [resp, setResp] = useState<SetupResp | null>(null);
  const [scanning, setScanning] = useState(true);
  const [scanErr, setScanErr] = useState<string | null>(null);

  // Profile form
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [ntfyTopic, setNtfyTopic] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const profileLoaded = useRef(false);

  const scan = useCallback(async () => {
    setScanning(true);
    setScanErr(null);
    try {
      const [r, nc] = await Promise.all([
        fetch("/api/setup", { cache: "no-store" }),
        fetch("/api/automations/notify-config", { cache: "no-store" }),
      ]);
      const data: SetupResp = await r.json();
      setResp(data);
      // Pre-fill profile fields on first load
      if (!profileLoaded.current) {
        profileLoaded.current = true;
        if (data.profile.name) setName(data.profile.name);
        if (data.profile.location?.label) setCity(data.profile.location.label);
        const notifyCfg = await nc.json() as { ntfyTopic?: string };
        if (notifyCfg.ntfyTopic) setNtfyTopic(notifyCfg.ntfyTopic);
      }
    } catch (e) {
      setScanErr(e instanceof Error ? e.message : "fejl");
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => { scan(); }, [scan]);

  const saveProfile = async () => {
    if (!name.trim() && !city.trim() && !ntfyTopic.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const ops: Promise<Response>[] = [];
      if (name.trim() || city.trim()) {
        ops.push(fetch("/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() || undefined, city: city.trim() || undefined }),
        }));
      }
      ops.push(fetch("/api/automations/notify-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ntfyTopic: ntfyTopic.trim() }),
      }));
      const results = await Promise.all(ops);
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const err = await failed.json() as { error?: string };
        setSaveMsg({ ok: false, text: err.error ?? "Fejl ved gem" });
      } else {
        setSaveMsg({ ok: true, text: "Gemt ✓" });
        scan();
      }
    } catch (e) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : "fejl" });
    } finally {
      setSaving(false);
    }
  };

  const summary = resp?.summary;
  const detections = resp?.detections ?? [];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#e5e5e5",
        fontFamily: MONO,
        fontSize: 13,
        lineHeight: 1.6,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 10, color: "#525252", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 12 }}>
            S.K.Y.N.E.T. · Opsætning
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 200, color: "#f5f5f5", margin: 0, letterSpacing: "-0.01em" }}>
            Velkommen.
          </h1>
          <p style={{ color: "#6b6b6b", marginTop: 8, maxWidth: 520, lineHeight: 1.7 }}>
            Skynet er installeret og kører. Fortæl mig hvad jeg skal kalde dig og din by —
            så er vi klar til at gå.
          </p>
        </div>

        {/* ── Profile form ─────────────────────────────────────────────────── */}
        <div
          style={{
            border: "1px dashed #262626",
            padding: "20px 24px 24px",
            marginBottom: 32,
          }}
        >
          <div style={{ fontSize: 10, color: "#525252", letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: 20 }}>
            # profil
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            {/* Name */}
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#6b6b6b", marginBottom: 6 }}>
                Hvad skal jeg kalde dig?
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="dit navn"
                style={INPUT}
                onKeyDown={(e) => e.key === "Enter" && saveProfile()}
              />
            </div>

            {/* City */}
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#6b6b6b", marginBottom: 6 }}>
                Din by (vejr · el-pris · fly)
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="fx København, London, New York"
                style={INPUT}
                onKeyDown={(e) => e.key === "Enter" && saveProfile()}
              />
            </div>

            {/* ntfy topic */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 11, color: "#6b6b6b", marginBottom: 6 }}>
                ntfy push-topic <span style={{ color: "#3a3a3a" }}>(valgfri — modtag push på iPhone/Android)</span>
              </label>
              <input
                type="text"
                value={ntfyTopic}
                onChange={(e) => setNtfyTopic(e.target.value)}
                placeholder="fx skynet-parthee-xyz  (hent ntfy-appen og abonnér på dit topic)"
                style={INPUT}
                onKeyDown={(e) => e.key === "Enter" && saveProfile()}
              />
              <div style={{ fontSize: 10, color: "#3a3a3a", marginTop: 4 }}>
                Gratis · ingen konto · E2E-krypteret · <a href="https://ntfy.sh" target="_blank" rel="noreferrer" style={{ color: "#525252" }}>ntfy.sh</a>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={saveProfile}
              disabled={saving || (!name.trim() && !city.trim() && !ntfyTopic.trim())}
              style={{
                background: "none",
                border: "1px dashed #444",
                padding: "6px 16px",
                color: saving || (!name.trim() && !city.trim()) ? "#444" : "#e5e5e5",
                fontFamily: MONO,
                fontSize: 12,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "gemmer…" : "→ gem"}
            </button>
            {saveMsg && (
              <span style={{ fontSize: 12, color: saveMsg.ok ? "#7dd67d" : "#d87373" }}>
                {saveMsg.text}
              </span>
            )}
            {resp?.profile.location && (
              <span style={{ fontSize: 11, color: "#3a3a3a", marginLeft: "auto" }}>
                gemt lokation: {resp.profile.location.label} ({resp.profile.location.lat.toFixed(2)}, {resp.profile.location.lng.toFixed(2)})
              </span>
            )}
          </div>
        </div>

        {/* ── System status ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "#525252", letterSpacing: "0.25em", textTransform: "uppercase" }}>
              # systemstatus
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {resp?.at && (
                <span style={{ fontSize: 10, color: "#3a3a3a" }}>
                  scannet {new Date(resp.at).toLocaleTimeString("da-DK")}
                </span>
              )}
              <button
                onClick={scan}
                disabled={scanning}
                style={{
                  background: "none",
                  border: "none",
                  color: scanning ? "#444" : "#6b6b6b",
                  fontFamily: MONO,
                  fontSize: 11,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {scanning ? "scanner…" : "↻ rescan"}
              </button>
            </div>
          </div>

          {/* Summary bar */}
          {summary && (
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              {(["ok", "partial", "missing"] as const).map((s) => (
                <div
                  key={s}
                  style={{
                    border: `1px dashed ${S[s].border}`,
                    background: S[s].row,
                    padding: "8px 20px",
                    minWidth: 80,
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 200, color: S[s].dot, tabularNums: true } as React.CSSProperties}>
                    {summary[s]}
                  </div>
                  <div style={{ fontSize: 10, color: "#525252", letterSpacing: "0.2em", textTransform: "uppercase", marginTop: 2 }}>
                    {S[s].label}
                  </div>
                </div>
              ))}
              <div style={{ border: "1px dashed #1c1c1c", padding: "8px 20px", minWidth: 80 }}>
                <div style={{ fontSize: 24, fontWeight: 200, color: "#525252" }}>{summary.total}</div>
                <div style={{ fontSize: 10, color: "#3a3a3a", letterSpacing: "0.2em", textTransform: "uppercase", marginTop: 2 }}>total</div>
              </div>
            </div>
          )}

          {scanErr && (
            <div style={{ border: "1px dashed #d87373", background: "rgba(216,115,115,0.05)", padding: "8px 12px", color: "#d87373", fontSize: 12, marginBottom: 12 }}>
              Scan fejlede: {scanErr}
            </div>
          )}

          {/* Detection table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px dashed #262626", color: "#525252" }}>
                <th style={{ textAlign: "left", padding: "0 12px 8px 0", fontWeight: 400, width: 20 }}></th>
                <th style={{ textAlign: "left", padding: "0 12px 8px 0", fontWeight: 400, width: 180 }}>service</th>
                <th style={{ textAlign: "left", padding: "0 12px 8px 0", fontWeight: 400 }}>detalje</th>
                <th style={{ textAlign: "left", padding: "0 0 8px 0", fontWeight: 400, width: 200 }}>widget / feature</th>
              </tr>
            </thead>
            <tbody>
              {detections.length === 0 && scanning && (
                <tr>
                  <td colSpan={4} style={{ padding: "20px 0", color: "#3a3a3a" }}>scanner…</td>
                </tr>
              )}
              {detections.map((d) => {
                const st = S[d.status];
                return (
                  <tr key={d.key} style={{ borderBottom: "1px dashed #1c1c1c" }}>
                    <td style={{ padding: "7px 12px 7px 0" }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: st.dot }} />
                    </td>
                    <td style={{ padding: "7px 12px 7px 0", color: d.status === "ok" ? "#e5e5e5" : d.status === "partial" ? "#e6b450" : "#d87373" }}>
                      {d.name}
                    </td>
                    <td style={{ padding: "7px 12px 7px 0" }}>
                      {d.details && <span style={{ color: "#9b9b9b" }}>{d.details}</span>}
                      {d.hint && (
                        <span style={{ display: "block", color: "#525252", fontSize: 10, marginTop: 2 }}>
                          → {d.hint}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "7px 0 7px 0", color: "#525252", fontSize: 11 }}>
                      {d.feature}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <div
          style={{
            borderTop: "1px dashed #1c1c1c",
            paddingTop: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <p style={{ color: "#525252", fontSize: 11, margin: 0, maxWidth: 480 }}>
            Widgets der ikke kræver opsætning (vejr, fly, jordskælv, markeder, GitHub trending)
            virker allerede. Konfigurér LM Studio for chat og automationer.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <a
              href="/settings"
              style={{
                display: "inline-block",
                border: "1px dashed #333",
                padding: "7px 18px",
                color: "#9b9b9b",
                fontFamily: MONO,
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              settings
            </a>
            <a
              href="/minimal"
              style={{
                display: "inline-block",
                border: "1px dashed #444",
                padding: "7px 18px",
                color: "#e5e5e5",
                fontFamily: MONO,
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              → åbn dashboard
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
