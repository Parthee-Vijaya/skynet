#!/usr/bin/env node
/**
 * Fang friske screenshots af alle cockpit-sider til docs/screenshots/.
 *
 * Brug:
 *   node scripts/capture-screenshots.mjs
 *   PORTAL_URL=http://localhost:3100 node scripts/capture-screenshots.mjs
 *
 * Maskerer automatisk personlig data (navn, ntfy-topic, IP, porte, Plex-titler,
 * telefonnummer, agent-logs) før capture, så output er sikker at committe til
 * et offentligt repo.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const PORTAL = process.env.PORTAL_URL ?? "http://localhost:3100";
// Scriptet bor i packages/portal/scripts/ → sti er ../../../docs/screenshots/
const OUT_DIR = new URL("../../../docs/screenshots/", import.meta.url).pathname;

const SHOTS = [
  { path: "/minimal",     file: "dashboard.png",    wait: 4000 },
  { path: "/agents",      file: "agents.png",       wait: 1500 },
  { path: "/automations", file: "automations.png",  wait: 2500 },
  { path: "/chat",        file: "chat.png",         wait: 1500 },
  { path: "/setup",       file: "setup.png",        wait: 2500 },
];

/**
 * CSS-maskering der SKJULER konkrete tekst-strenge med personlig data
 * uden at ødelægge layout. Brug background + color:transparent for at
 * bevare dimensionering af elementer.
 */
const MASK_CSS = `
  /* Skjul greeting i HeroWidget (indeholder brugers fornavn) */
  [class*="HeroWidget"] p,
  main section:first-child p,
  section[class*="hero"] p {
    color: transparent !important;
  }

  /* Ribbon: skjul values (porte, domæner, ntfy-topic) — behold labels */
  [class*="RibbonWidget"] > div > div:not(:first-child) span:last-child,
  [class*="Ribbon"] .ribbon-value,
  main > div:nth-child(3) [class*="mono"] {
    background: #262626 !important;
    color: transparent !important;
    border-radius: 2px !important;
  }

  /* IP-adresse i NetWidget */
  [class*="NetWidget"] td:last-child,
  section:has(> h2:contains("net")) .tabular-nums {
    background: #262626 !important;
    color: transparent !important;
  }

  /* Services & ports — hele tabellen maskeres, vi viser bare strukturen */
  section:has(> h2 > span:first-child > span ~ *) table tbody tr td:first-child,
  section[aria-label*="services"] td:first-child {
    color: #333 !important;
  }

  /* Plex streams indeholder private filmtitler */
  section:has(h2 > span:first-child > span ~ :text("plex")) [class*="truncate"],
  [class*="PlexWidget"] .text-neutral-100 {
    background: #262626 !important;
    color: transparent !important;
    border-radius: 2px !important;
  }

  /* Automations: iMessage-nr + ntfy-topic-input + agent-log panel */
  input[type="password"],
  input[placeholder*="+45"],
  input[placeholder*="skynet-"],
  [class*="AgentLogPanel"] div[style*="flex"] {
    background: #222 !important;
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
  }

  /* Setup: ntfy-topic felt, gemt lokation-display */
  input[placeholder*="skynet-"],
  input[placeholder*="ntfy"] {
    background: #262626 !important;
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
  }

  /* Gmail: user-adresse */
  input[type="email"] {
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
  }

  /* Universal: alle elementer der eksplicit er markeret som følsom data */
  [data-pii], [data-sensitive] {
    background: #262626 !important;
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
    border-radius: 2px !important;
  }
`;

/**
 * Direkte DOM-tekst-substitution for data vi IKKE kan CSS-maske (fx når
 * værdien er indlejret mid-sentence). Erstatter alle matches i body.
 */
const SCRUB_SCRIPT = `
  (() => {
    const PATTERNS = [
      // Navn i greeting ("god aften, parthee.") → "god aften, skynet-bruger."
      { re: /(god (aften|morgen|dag|nat|eftermiddag), )[^.,]+?(\\.)/gi, repl: '$1[navn]$3' },
      // Dansk mobil (+45 XX XX XX XX eller 8 cifre)
      { re: /\\+45\\s?\\d{2}\\s?\\d{2}\\s?\\d{2}\\s?\\d{2}/g, repl: '+45XXXXXXXX' },
      // IPv4
      { re: /\\b(\\d{1,3}\\.){3}\\d{1,3}\\b/g, repl: 'X.X.X.X' },
      // ntfy topic "skynet-*"
      { re: /skynet-[a-z0-9-]+/gi, repl: 'skynet-[topic]' },
      // Email
      { re: /[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}/gi, repl: 'you@domain.com' },
    ];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      let txt = node.nodeValue;
      for (const { re, repl } of PATTERNS) txt = txt.replace(re, repl);
      if (txt !== node.nodeValue) node.nodeValue = txt;
    }
    // Også input-values
    document.querySelectorAll('input[type="text"], input[type="email"], input[type="url"]').forEach(el => {
      let v = el.value;
      for (const { re, repl } of PATTERNS) v = v.replace(re, repl);
      if (v !== el.value) el.value = v;
    });
  })()
`;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "da-DK",
    timezoneId: "Europe/Copenhagen",
    colorScheme: "dark",
  });

  for (const shot of SHOTS) {
    const url = `${PORTAL}${shot.path}`;
    console.log(`→ ${url}`);
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {
        /* fortsæt — nogle widgets laver løbende requests */
      });
      await page.addStyleTag({ content: MASK_CSS });
      await page.waitForTimeout(shot.wait);
      // Scrub tekst-noder (runs i browser)
      await page.evaluate(SCRUB_SCRIPT);
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `${OUT_DIR}${shot.file}`,
        fullPage: false,
        animations: "disabled",
        type: "png",
      });
      console.log(`  ✓ ${shot.file}`);
    } catch (e) {
      console.error(`  ✗ ${shot.file}: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  await ctx.close();
  await browser.close();
  console.log(`\nscreenshots → ${OUT_DIR}`);
  console.log(`\nHusk at gennemse filerne før commit:`);
  console.log(`  open ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
