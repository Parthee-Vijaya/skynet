import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "skynet.db");
const OLD_DB_PATH = path.join(DATA_DIR, "jarvis.db");

let db: Database.Database | undefined;

function getDb(): Database.Database {
  if (!db) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_PATH) && fs.existsSync(OLD_DB_PATH)) {
      fs.renameSync(OLD_DB_PATH, DB_PATH);
    }
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_history_metric_ts ON history(metric, ts);

    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS automations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      trigger_type TEXT NOT NULL,
      trigger_config TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_config TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at INTEGER,
      last_status TEXT,
      last_message TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_automations_enabled ON automations(enabled);

    CREATE TABLE IF NOT EXISTS automation_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      automation_id INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      status TEXT NOT NULL,
      message TEXT,
      FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_automation_runs_auto ON automation_runs(automation_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS telegram_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      direction TEXT NOT NULL,         -- 'in' | 'out'
      sender TEXT,                     -- username eller 'skynet'
      text TEXT NOT NULL,
      tools_used TEXT,                 -- JSON-array når LLM brugte tools
      message_id INTEGER,              -- Telegrams message_id (kan være null for fejlet send)
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_messages_chat ON telegram_messages(chat_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_telegram_messages_created ON telegram_messages(created_at DESC);

    CREATE TABLE IF NOT EXISTS delegate_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      mode TEXT NOT NULL,              -- 'cli' | 'terminal'
      agent TEXT,
      effort TEXT,
      working_dir TEXT NOT NULL,
      status TEXT NOT NULL,            -- 'running' | 'done' | 'failed' | 'killed'
      pid INTEGER,
      exit_code INTEGER,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      last_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_delegate_started ON delegate_tasks(started_at DESC);

    -- ── Firewall / Network Monitor (Fase 1+) ──────────────────────────────
    CREATE TABLE IF NOT EXISTS network_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      pid INTEGER,
      process TEXT NOT NULL,
      bundle_id TEXT,
      exec_path TEXT,
      proto TEXT NOT NULL,             -- 'tcp4' | 'tcp6' | 'udp4' | 'udp6'
      laddr TEXT,
      lport INTEGER,
      raddr TEXT,
      rport INTEGER,
      rhost TEXT,
      state TEXT,
      bytes_in INTEGER NOT NULL DEFAULT 0,
      bytes_out INTEGER NOT NULL DEFAULT 0,
      is_new INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_netconn_ts ON network_connections(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_netconn_proc ON network_connections(process, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_netconn_raddr ON network_connections(raddr);
    CREATE INDEX IF NOT EXISTS idx_netconn_new ON network_connections(is_new, ts DESC);

    CREATE TABLE IF NOT EXISTS network_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lulu_key TEXT NOT NULL,
      process TEXT,
      exec_path TEXT,
      action TEXT NOT NULL,            -- 'allow' | 'block' | 'ask'
      scope TEXT NOT NULL,             -- 'all' | 'host' | 'host:port'
      remote_host TEXT,
      remote_port INTEGER,
      source TEXT NOT NULL DEFAULT 'lulu',  -- 'lulu' | 'skynet' | 'profile'
      profile_id INTEGER,
      description TEXT,
      llm_explanation TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_netrules_key ON network_rules(lulu_key);
    CREATE INDEX IF NOT EXISTS idx_netrules_profile ON network_rules(profile_id);

    CREATE TABLE IF NOT EXISTS network_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      ssid_pattern TEXT,               -- glob: 'TDC-*' | exact: 'parti-home'
      trust_level TEXT NOT NULL DEFAULT 'normal',  -- 'high' | 'normal' | 'low'
      llm_summary TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_netprofiles_ssid ON network_profiles(ssid_pattern);

    CREATE TABLE IF NOT EXISTS network_blocklists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_url TEXT,
      domain_count INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      fetched_at INTEGER,
      cached_path TEXT
    );

    CREATE TABLE IF NOT EXISTS network_geo_cache (
      ip TEXT PRIMARY KEY,
      country TEXT,
      country_code TEXT,
      region TEXT,
      city TEXT,
      lat REAL,
      lng REAL,
      isp TEXT,
      asn TEXT,
      asn_org TEXT,
      cached_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_netgeo_expires ON network_geo_cache(expires_at);

    CREATE TABLE IF NOT EXISTS network_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      kind TEXT NOT NULL,              -- 'new_app' | 'blocked' | 'allowed' | 'profile_switch' | 'suspicious'
      process TEXT,
      bundle_id TEXT,
      raddr TEXT,
      rhost TEXT,
      detail TEXT,                     -- JSON
      llm_explanation TEXT,
      acknowledged INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_netevents_ts ON network_events(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_netevents_kind ON network_events(kind, ts DESC);
  `);
}

export { getDb };
