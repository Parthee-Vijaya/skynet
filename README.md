# S.K.Y.N.E.T.

**System for Knowledge, Yielding Neural Engagement & Tasks**

A unified monorepo for personal intelligence — dashboard, AI agent orchestration, and native macOS companion.

## Architecture

```
skynet/
├── packages/
│   ├── portal/     Next.js dashboard (port 3100)
│   ├── daemon/     Agent orchestration daemon (port 6767)
│   ├── relay/      WebSocket relay bridge
│   ├── highlight/  Syntax highlighting engine
│   ├── cli/        CLI tool (`skynet`)
│   └── hud/        Native macOS menu-bar app (Swift)
├── scripts/
│   └── install.sh  One-command installer
```

## Quick Start

```bash
# Install everything (Homebrew, Node, clone, build, LaunchAgents)
curl -fsSL https://raw.githubusercontent.com/Parthee-Vijaya/skynet/main/scripts/install.sh | bash
```

## Development

```bash
npm install              # Install all workspace dependencies
npm run dev              # Start portal + daemon (concurrently)
npm run dev:portal       # Portal only (http://localhost:3100)
npm run dev:daemon       # Daemon only (ws://localhost:6767)
npm run build:daemon     # Build daemon stack
npm run typecheck        # Typecheck all packages
npm run test             # Run all tests
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Portal  | 3100 | Web dashboard with widgets, chat, agents, automations |
| Daemon  | 6767 | Agent lifecycle management via WebSocket |
| HUD     | —    | Native macOS menu-bar companion |

## License

Private.
