# Working on Zpace

How to run it, how it is built, how Claude Code is driven, and the keyboard. The conventions for code, design and motion are in [CLAUDE.md](../CLAUDE.md).

## Running it

Requirements: Node ≥ 20, Rust stable (`rustup`), and on Windows the MSVC Build Tools + WebView2 (already present on Windows 11).

```bash
npm install

# Frontend only — browser preview with the sample workspace and a scripted agent.
npm run dev            # http://localhost:1420

# Desktop shell (real PTYs, real Claude Code, SQLite, native dialogs/notifications)
npm run tauri:dev
```

Quality gates:

```bash
npm run typecheck      # tsc -b
npm run lint           # eslint (typescript-eslint + react-hooks v7 rules)
npm run build          # vite production build → dist/
cd src-tauri && cargo check
```

### Compiling for Windows

```bash
npm run tauri:build:win        # → src-tauri/target/release/bundle/{nsis,msi}/
```

Produces an NSIS installer (per-user); the release workflow builds it, the macOS universal `.dmg` and the Linux `.deb` / `.rpm` / `.AppImage` on a `v*` tag. The window is undecorated (`tauri.windows.conf.json`) and draws its own caption buttons; drag regions use `data-tauri-drag-region`, double-click on them toggles maximize.

### Compiling for macOS

```bash
npm run tauri:build:mac        # → src-tauri/target/release/bundle/{dmg,macos}/
```

`tauri.macos.conf.json` switches the window to `titleBarStyle: "Overlay"` with hidden title and offset traffic lights; the sidebar reserves the top-left area for them and the Windows caption strip is not rendered. Signing/notarisation are configured the usual Tauri way (`bundle.macOS.signingIdentity`, `APPLE_ID` env) and are not part of this repo.

### Regenerating icons

```bash
npm run icons          # tauri icon assets/icon-source.png (the Z tile, 1024×1024 with transparent corners)
```

The brand lives in `assets/` (`zorynq-original.png` as delivered, `icon-source.png` for `tauri icon`) and `public/brand/` (`zorynq.png`, the tile at 256 px for dialogs; `zorynq-mark.png`, the Z alone as an alpha mask so `<ZorynqMark>` paints it in any colour). Storage keys, the SQLite file (`conduit.db`), the bundle identifier (`dev.conduit.app`) and the DEV hook `window.__conduit` keep their original names so existing data survives the rename.


---

## Architecture

```
src/
  app/            App shell, bootstrap (env detection, persistence), global shortcuts
  components/
    ui/           Design system: Button, IconButton, Tooltip, Popover, DropdownMenu, ContextMenu,
                  Dialog (pretty-modal morph), Sheet, Tabs, SegmentedControl, Badge, StatusDot,
                  Progress, TextInput, Textarea, Select, Switch, Shortcut, Divider, ScrollArea,
                  VirtualList, Collapsible, Grip
    layout/       TitleBar (Windows strip + caption buttons), Sidebar, Workspace (card, pane tree),
                  SplitPane
  features/
    agent/        SessionView, Composer, SessionFooter (status bar), ContextMeter, Markdown,
                  blocks/ (UserMessage, AgentMessage, ToolGroup, CommandExecution, FileChanges,
                  PermissionRequest, AgentStatus, ThinkingState, ErrorBlock, ImageBlock)
    terminal/     XTerminal (xterm + PTY), TerminalPanel (tabs), preview shell for the browser
    projects/     ProjectGroup (sidebar), HomeScreen
    sessions/     SessionRow, RenameDialog, useWorkspaceActions
    files/        Explorer, DiffPane/DiffViewer (Monaco diff, lazy), Lightbox
    git/          GitPanel (changes / staged / commits, stage/unstage/discard/commit/push/pull)
    search/       GlobalSearch (Ctrl+Shift+F)
    palette/      CommandPalette (Ctrl+K) + command registry
    settings/     SettingsDialog, Onboarding, AboutDialog
    notifications/ sileo host, toast store, rich toasts (Claude / git), synthesised sounds
  providers/      AgentProvider interface, ClaudeCodeProvider + ClaudeAdapter, MockProvider, runtime
  native/         Typed bridge to Tauri commands with browser fallbacks (system, pty, process, window)
  stores/         Zustand: projects, sessions (+ streaming batcher), ui (layout tree), settings,
                  terminals, environment
  database/       Drizzle schema + SQLite client (tauri-plugin-sql) mirroring the stores
  types/          AgentEvent schema, workspace types
  styles/         tokens.css (design tokens, light/dark), globals.css (Tailwind theme, prose, utilities)
  mock/           Sample workspace matching the reference screenshot

src-tauri/
  src/lib.rs                plugins + command registry
  src/commands/system.rs    detect_environment: claude / git / node / WSL distros / shells
  src/commands/pty.rs       portable-pty (ConPTY on Windows) → pty://data, pty://exit
  src/commands/process.rs   line-oriented child processes → process://line, process://exit
  src/commands/git.rs       git summary/status/log/stage/unstage/discard/commit/push/pull
  capabilities/default.json permissions for the main window
  tauri.conf.json (+ tauri.windows.conf.json, tauri.macos.conf.json)
```

### Design system

Tokens live in `src/styles/tokens.css` as CSS variables (`--background`, `--surface`, `--sidebar`, `--border`, `--text-*`, `--accent`, `--accent-warm`, `--radius-*`, `--shadow-*`, `--motion-*`) and are exposed to Tailwind through `@theme inline`. Light is the default; `.dark` on `<html>` swaps the palette. The window canvas is the sidebar grey and the workspace floats on it as a white card, exactly like the reference.

Typography: Inter (UI) and JetBrains Mono (transcript, terminal, status footer) bundled locally via `@fontsource-variable`; Geist Sans/Mono are selectable in Settings › Appearance.

### Motion

`src/lib/motion.ts` holds the spring/tween presets and the "origin" tracker that lets modals and toasts morph out of the control that opened them:

- **Dialogs** (`components/ui/Dialog.tsx`) — the *pretty-modal* recipe: FLIP from the trigger (position + uniform scale), 8px blur-in, overlay with backdrop blur; on close the panel travels back towards its origin while blurring out and its radius grows.
- **Toasts** (`features/notifications/`) — [sileo](https://sileo.aaryan.design) (MIT): one pill per position that morphs between states with spring physics, dark on the light theme and light on the dark one. `toast-store.ts` keeps Zpace's API (`toast.success/error/info/warning/loading`, `toast.update`, `toast.promise`, dedupe by `key`) and adds rich content: the description and the icon are React nodes. `rich.tsx` builds the ones that matter — "Claude finished" with the mark, the files the turn wrote with their +/− lines and an *Open* button; "Permission required" with *Answer*; a commit with its hash, message and file count; push / pull / fetch as one pill whose steps light up and morph into done (or red). Position in Settings › Notifications, toasts hide the native browser under them, Alt+T focuses the newest.
- Dropdowns, context menus and popovers scale from `--radix-*-transform-origin` with a short blur; tool groups and commands expand with a spring (`Collapsible`).
- **Living layout** (`components/ui/Living.tsx`) — nothing animates height. A container that changes size (`LivingBox`) carries `layout` and moves with one spring (420 / 34 / 0.8, no visible bounce); conditional content (`LivingReveal`) fades and slides in *while* the box is still growing and, on close, pops out of the flow at once and fades under the closing box; every neighbour is a position-only node (`LivingItem`) in the same `LivingGroup`, so a change anywhere moves everything below continuously, with no frame where the layout jumps. Interruptible: open → close → open continues from wherever the element is. Used by the sidebar sections and project groups, the explorer tree, the review file list, note tags, the MCP add form (fields arrive staggered) and the arena cards. The transcript keeps the height-driven `Collapsible` because its rows are positioned by a virtualiser from measured heights. Micro: every button dips to 0.97 on press and springs back (`press`, a `linear()` spring in CSS), chevrons turn 0→90°, the sidebar's + turns into an × while its menu is open.
- Everything respects `prefers-reduced-motion` (and the Settings override) via `MotionConfig`.

### State & performance

- Zustand stores with selectors; the session event log is kept apart from session metadata.
- Streaming deltas are coalesced per animation frame (`appendDelta`) so a token never re-renders the transcript.
- Blocks are derived from events (`features/agent/blocks.ts`) — consecutive tool events fold into a `ToolGroup` with a natural-language summary ("Searched for 10 patterns, listed 4 directories, ran 6 shell commands"); file writes become a change list.
- The transcript is virtualised (`VirtualList`, TanStack Virtual with dynamic measurement) and follows output while the user is at the bottom.
- Monaco is a lazy chunk; it only loads when a diff is opened.

### Persistence

- Browser preview: Zustand `persist` (localStorage).
- Desktop: `tauri-plugin-sql` + SQLite (`conduit.db` in the app data dir). `src/database/client.ts` loads projects/sessions/events at boot and writes back debounced upserts; the Drizzle schema in `src/database/schema.ts` documents the tables (`npm run db:generate` produces migrations). Layout (split panes, sidebar, terminal drawer, active session) is restored on launch.

---

## Claude Code integration

Zpace never simulates Claude. `ClaudeCodeProvider` launches the real binary as a child process in bidirectional stream-json mode:

```
claude -p --output-format stream-json --input-format stream-json --verbose
       --include-partial-messages --permission-prompt-tool stdio
       [--model opus] [--permission-mode acceptEdits] [--resume <session_id>]
```

- **stdin** receives user turns as `{"type":"user","message":{"role":"user","content":[…]}}` (text + base64 images).
- **stdout** lines are parsed by `ClaudeAdapter` into the normalised `AgentEvent` schema (`src/types/agent.ts`): `system.init` → provider session id, `stream_event` deltas → streaming `assistant_message` / `thinking`, `tool_use` blocks → `shell_command` / `file_read` / `file_write` / `search` / `tool_call`, `tool_result` (+ `tool_use_result` with `structuredPatch`, `stdout/stderr`) → status, output, +/− counts, `result` → `completed` + usage/cost.
- **Permissions**: the CLI emits `control_request { subtype: "can_use_tool" }`; the UI renders an inline `PermissionRequest` and answers with `control_response { behavior: "allow" | "deny" }`. "Always allow" is remembered per tool for the session. Cancel sends `control_request { subtype: "interrupt" }`.
- The process stays alive across turns; `providerSessionId` is persisted so `--resume` restores the conversation after an app restart.
- **WSL**: projects opened with `runtime: "wsl"` run `wsl.exe -d <distro> --cd /mnt/c/… -- claude …`; `native/system.ts` maps `C:\Users\…` ↔ `/mnt/c/Users/…`. The onboarding detects distros through `wsl.exe -l -q` (UTF-16 output is decoded on the Rust side).
- If `claude --version` is not found the onboarding shows "Claude Code not found" with Install / Retry; in the browser preview (no Tauri) a `MockProvider` scripts a full turn — searches, a running command, streamed prose, a file edit and a permission prompt — so every block and animation can be evaluated without the CLI.

Adding another agent means implementing `AgentProvider` (`startSession / sendMessage / cancel / resume / respondPermission / getUsage / getCapabilities / dispose`) plus an adapter from its wire format to `AgentEvent`; the UI does not change. Codex, Gemini CLI and OpenCode run through their own terminals today; structured providers for them follow the same interface.

---

## Keyboard

| Shortcut | Action |
| --- | --- |
| Ctrl/⌘ Space | Spotlight (files, commands, notes, sessions, sums, URLs, web search, ask Claude) |
| Ctrl/⌘ K · Ctrl/⌘ Shift P | Command palette |
| Ctrl/⌘ P | Quick open file |
| Ctrl/⌘ Shift F | Global search (projects, terminals + their output, notes, sessions, files) |
| Ctrl/⌘ F (in a terminal) | Find in terminal |
| Ctrl/⌘ Shift S | Filter sidebar |
| Ctrl/⌘ Shift T · Ctrl/⌘ Shift N | New terminal · New note (inside the selected project) |
| Ctrl/⌘ N | New session |
| Ctrl/⌘ O | Open project |
| Ctrl/⌘ W | Close pane |
| Ctrl/⌘ ` | Terminal drawer |
| Ctrl/⌘ B | Sidebar |
| Ctrl/⌘ Shift E | File explorer |
| Ctrl/⌘ Shift G | Git panel |
| Ctrl/⌘ , | Settings |
| Shift Tab (in composer) | Cycle permission mode |
| Enter / Shift Enter | Send / newline (configurable to Ctrl Enter) |
| `/` · `@` | Slash commands · mentions (`/effort`, `/add-dir`, `/permissions`, `/autocompact`, `/agent`, `/fallback-model` apply to the session and resume the same conversation; `/rc`, `/resume`, `/doctor`… open Claude's own terminal beside the chat, resuming the same session id) |
| Ctrl/⌘ K (in a file) · right-click | Ask Claude about the selection (inline card) |
| Alt T | Focus latest notification |

