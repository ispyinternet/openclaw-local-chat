# Spec: DeerFlow-style Chat UX for OpenClaw Local Chat

## Goal
Make the local chat app feel like DeerFlow’s conversation experience:
- left pane = thread list (chat-first)
- main pane = conversation flow
- keep OpenClaw session/runtime capabilities, but hide backend complexity by default

## Core UX Principles
1. **Chat-first language:** user sees “Chats”, not “Sessions”.
2. **Runtime under the hood:** session IDs remain internal but are not primary UI labels.
3. **One active agent per chat:** agent is a property of the chat/thread.
4. **Progressive disclosure:** advanced ops (runs/files/tasks/context) available, but not front-and-center.

## Information Architecture

### Left pane (primary nav + chats)
- Header: app name + collapse button
- Primary action: `New chat`
- Nav:
  - Chats
  - Agents
- Recent chats list:
  - Title: generated from first user message
  - Subtitle: last activity time (or snippet)
  - Optional badges: unread count, active agent
  - Overflow menu for per-chat actions
- Footer: settings/profile

### Main pane (conversation)
- Chat header:
  - Chat title
  - Agent selector (`Agent: X`)
  - Optional controls (search, hide sidebar)
- Message timeline
- Composer
  - multiline input
  - send
  - optional attachments/macros

### Right pane (optional, collapsible)
- Tabs: Context / Runs / Files / Tasks
- Hidden by default for chat-focused mode

## Data Model Changes

### Chat title
- `chatTitle` derived from first user message:
  - trim whitespace
  - strip markdown noise
  - max length: 72 chars
  - fallback: `New chat`

### Session ↔ chat mapping
- Keep backend `sessionId` unchanged.
- Display `chatTitle` in left list and chat header.
- Keep raw IDs in debug/details only.

### Agent assignment
- Per chat: `agentId` + `agentDisplayName`
- Agent switch affects **new messages only** in that chat
- Emit local system event/message: `Switched to <agent>`

## Interaction Flows

### New chat
1. User clicks `New chat`
2. Optional agent pick (default preselected)
3. Empty chat opens in main pane
4. On first user message, title auto-generates

### Chat list title updates
- After first user message send success, update chat title in list + header.
- If first message edited/deleted later, do not auto-retitle (unless explicitly requested).

### Agent switching
1. User opens agent picker in chat header.
2. Select agent.
3. Persist to chat metadata.
4. Show subtle system note in timeline.

## Visual Notes
- Reduce ops-heavy affordances in default view.
- Keep gateway health status available but not dominant in top bar.
- Keep keyboard shortcuts and session sync behavior unchanged.

## Non-goals
- No backend session protocol rewrite.
- No multi-agent branching timeline in v1.
- No removal of existing right-rail tooling (only de-emphasize/collapse by default).

## Acceptance Criteria
1. Left pane lists chats by human-readable titles (first user message), not raw session names.
2. Main pane shows normal chat flow with selected chat context.
3. Agent badge visible in chat list and header.
4. Agent switcher works per chat and only affects future turns.
5. Existing message send/sync still works with gateway UUID sessions.
6. Right rail can be hidden and does not distract from chat flow by default.

## Rollout Plan
1. Rename UI copy from sessions→chats where user-facing.
2. Implement title derivation + persistence.
3. Add agent metadata to chat records + picker UI.
4. Default layout polish (left/main emphasis, right rail collapsed).
5. QA with keyboard shortcuts + gateway sync regression tests.
