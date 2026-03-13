# OpenClaw Chat Desktop

A local-first Electron + Svelte desktop client for OpenClaw sessions.

## What it does

- Loads/saves sessions and messages in a local SQLite cache
- Syncs gateway sessions via `openclaw sessions --json`
- Sends messages via `openclaw agent --json` with session-aware routing (`--session-id` for gateway and local continuity, plus per-chat `--agent` for local threads)
- Shows search, session switching, status/heartbeat, and basic settings
- Lets you copy the active chat ID from the Context panel for support/debug workflows
- Surfaces active agent badges in both chat list and chat header
- Starts with right context rail collapsed for chat-focused default layout
- Surfaces CLI failures with clearer timeout/exit/stderr diagnostics

## Requirements

- Node.js 22+
- OpenClaw CLI installed and available on `PATH`
- A reachable local/remote OpenClaw gateway

## Development

```bash
npm install
npm run dev
```

Dev mode runs:
- Vite renderer on `http://localhost:5173`
- Electron app attached to that renderer

## Tests

```bash
npm test
```

Current tests cover:
- Agent response extraction/parsing
- Gateway session payload normalization
- CLI error summarization for timeout/exit/stderr cases

## Build (Linux AppImage)

```bash
npm run build
```

This builds the renderer and packages Electron using `electron-builder`.

Output:
- `release/OpenClaw Chat Desktop-<version>.AppImage`

## Keyboard shortcuts

- `⌘/Ctrl + K` — focus search
- `⌘/Ctrl + F` — focus search
- `⌘/Ctrl + ,` — open settings
- `⌘/Ctrl + Shift + R` — sync chats
- `⌘/Ctrl + Shift + [` — previous session
- `⌘/Ctrl + Shift + ]` — next session
- `Esc` — close settings or collapse right panel

## Notes

- Non-gateway/demo sessions are handled locally (no CLI send)
- Settings currently include gateway URL and theme
- Context panel includes per-chat routing controls and a copy-chat-id action
- If the OpenClaw CLI is missing (or not executable), sync/send errors will explicitly state that
