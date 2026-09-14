# Zpace

A premium, 100% local desktop workspace: real terminals (PowerShell, Git Bash, WSL…), Claude Code one click away in any folder, Markdown notes, git with branches, an embedded browser and a structured agent transcript — all in one window, persisted in a local SQLite database, fully themeable.

Built with Tauri 2 · React 19 · TypeScript · Vite · Tailwind 4 · Motion · Radix · xterm.js · Monaco · Zustand · SQLite/Drizzle.

**Download:** Windows, macOS and Linux installers are on [zpace-releases](https://github.com/Nicoo01x/zpace-releases/releases/latest). Free, forever. Plugins: [zpace-plugins](https://github.com/Nicoo01x/zpace-plugins).

```
┌───────────────────────────────────────────────────────────────┐
│ ▣  ⎇ 4                                              – ▢ ×    │  title strip (Windows)
├───────────┬───────────────────────────────────────────────────┤
│ money     │ ⁝⁝ Production deployment setup      ⧉  ⌕  ⋯  ×   │  workspace card
│ luisdavid │                                                   │
│ melon-mind│ ● ¿Qué querés aclarar?                            │
│  ⁝⁝ Arqu… │ ✱ Brewed for 1m 35s · done 10:43 PM               │
│     Docu… │ ❯ mensaje del usuario…                            │
│     Prod… │   Searched for 10 patterns, listed 4 directories… │
│ super-be… │ ● Ya tengo el mapa. Aplico los cambios.           │
│           │ ─────────────────────────────────────────────     │
│           │ ❯ Ask Claude anything…                            │
│  +     ⚙  │ [Opus 5 (1M context)] | melon-mind | ▰▱▱ 10% | …  │
└───────────┴───────────────────────────────────────────────────┘
```

---

## 0. What you get

- **Terminals first** — every terminal is a sidebar item (ConPTY on Windows, forkpty on macOS/Linux), listed **inside its project**, restored on launch, with colour schemes (Zpace, Campbell, One Half Dark/Light, One Dark, Dracula, Nord, Gruvbox, Monokai, Solarized, GitHub, Catppuccin — plus "Match Windows Terminal"), a light/dark override for TUIs, font/line-height/cursor settings, **find in terminal (Ctrl+F)** and a bottom drawer (Ctrl+`).
- **Nerd Fonts out of the box** — the terminal uses Windows Terminal's configured face when it is installed (e.g. *SpaceMono Nerd Font Mono*), otherwise the interface mono font, and always falls back to a bundled *Symbols Nerd Font Mono* so oh-my-posh / starship / Claude Code glyphs render whatever the primary font. Shells never inherit `NO_COLOR`, `CLAUDECODE`, `WT_*` or similar from whatever launched the app.
- **Claude Code** — the "+" menu opens Claude Code's interactive TUI in any folder (or the current project), plus a structured session view (Ctrl+N) that speaks stream-json with permission prompts, tool summaries, diffs, tokens and cost.
- **Notes** — a compose glyph with the count in the title bar drops them down as stickies (white sheet, yellow header). The editor is plain text that formats on demand: select text and a Discord-style bubble offers bold / italic / underline / strike / highlight / code / headings / lists / checklist / quote (Tiptap, stored as Markdown; "Markdown source" switches to the raw editor with preview). Tags, project association, pinning, autosave, export, search. Project notes are listed inside their project.
- **Boards** — a note can be a whiteboard: dotted paper (black or white dots per theme), pan / zoom, sticky cards in five colours, curved links between anything. The eye on a project folder opens the **project board**: the sessions running there with their status and the files they touched, terminals and notes, drawn as nodes you can arrange, link and open — plus an "Add" menu that starts Claude Code / Codex / Gemini / a terminal / a note beside the board.
- **Agents** — Claude Code, Codex and Gemini CLI (when installed) from the "+" menu, a project's menu, the board and the file explorer ("Ask Claude (chat view)" starts a session with the @file typed; "Open in Claude Code / Codex / Gemini" start the TUI with the file as first prompt). Real brand marks in the sidebar. Claude launches take a model (Fable 5.1, Opus 5, Sonnet 5, Haiku 4.5, opusplan, custom ids), permission mode, `--continue` and free-form arguments — as defaults in Settings › Claude Code or in a floating launch panel ("with arguments…", or every time).
- **Usage gauge** — a title-bar chip (optional) with Claude Code's 5-hour / weekly limits as the CLI reports them during chat sessions, the active session's context and cost, and today's totals.
- **Screenshots** — the browser pane captures the page (GDI on Windows, `screencapture` on macOS) to the clipboard, to a PNG, or straight into a Claude chat as an attachment; "Crop an area…" freezes the page and lets you drag a rectangle first. Menus, popovers and toasts that would sit over the native webview hide it while they are open (the webview always paints above the DOM).
- **Drag to split** — drag a terminal, Claude Code, note or session from the sidebar onto a pane: edges split, the middle replaces; an item already open moves instead of duplicating.
- **Chat view, deeper** — the composer's `/` menu lists everything Claude Code can run: the CLI's own commands (from the session's `system/init`), your skills and custom commands (`~/.claude`, the project's `.claude`), plugin skills/commands (`/plugin:name`, with argument hints from frontmatter) and subagents; `@` mentions files of the project. A capabilities chip in the session footer shows tools, MCP servers (with status), skills, commands and agents, and drops any of them into the composer. New blocks rise in, tool groups flash a check when done, the prompt breathes while the agent works.
- **Mascot** — the [bloub](https://github.com/jeremy-prt/bloub) avatar engine (MIT, vendored in `src/features/mascot/bloub/`): a cloud (or 7 other shapes) in the colour you pick, eyes on the pointer, moods from the agents (thinking, alert when it needs you, notify when done, asleep when you are away), a trick on click. Lives in the title bar, a corner, the sidebar or just the home screen — Settings › Mascot.
- **Spotlight (Ctrl+Space)** — one bar, anything: files of the current project (by name), commands, notes, sessions, projects, a sum (`12*4+2` → `= 50`, Enter copies), a URL, a web search with the configured engine, or "Ask Claude: …" which starts a session with that question. Caught before the editor and the terminal see the key.
- **Ask any agent, with its mark** — every "ask" entry carries the agent's own logo (Claude, Codex, Gemini). The file pane's header is a split button that leads with the **default agent** (Settings › Agents & binaries) and drops the others down; the explorer's context menu and the palette follow the same order and marks.
- **Agent edits, visible** — when a chat session's Claude writes a file, the explorer tints it green with the Claude mark (folders get a green dot, a tooltip says when and how much), the open file pane reloads it and paints the added lines green with a gutter bar and an "Edited by Claude Code · +n −m" pill that opens the diff. An eraser in the explorer header clears the marks. `src/stores/touched.ts`, fed by `file_write` events once the tool has returned.
- **Ask about code, inline** — right-click a selection in Monaco (or Ctrl/⌘ K) → "Ask Claude about this code" opens a small movable, resizable card next to the selection with quick prompts (explain, bugs, refactor, tests, comments); the answer streams in from a real session named `file:line`, one click opens the full chat. Ctrl/⌘+click on a URL in code opens Zpace's browser beside the file.
- **OpenCode** — a fourth agent CLI next to Claude Code, Codex and Gemini: detected on PATH, launched from the "+" menu, a project's menu, the board, the editor's context menu ("Open in OpenCode with this code" passes the selection as `--prompt`) and the file header; selectable as the default agent.
- **Images, video, audio, PDF, binaries in the file pane** — served through Tauri's asset protocol (`assetProtocol.scope: ["**"]`, so large videos stream and seek): images on a checkerboard with fit / zoom (Ctrl+wheel, ±, double-click) and drag-to-pan, dimensions in the header; `<video>` / `<audio>` with native controls; PDFs in the webview's reader; anything else as a hex dump of its first 4 KB (`read_file_head`).
- **Editor context menu** — Monaco's own menu is replaced by Zpace's: "Ask Claude about this code" (Ctrl/⌘ K) and "Open in <agent> with this code" for every agent, each with its brand mark and greyed out when not installed, then cut / copy / paste / select all / command palette.
- **Inline ask card, dressed** — Claude's terracotta (`--claude`): a gradient strip, a tinted header, warm quick-prompt chips, a terracotta send button and a breathing glow while the answer streams; resizable from every edge and corner (visible grip), movable by its header.
- **Project folder colours** — adding a project opens a small "New project" dialog (name + one of nine folder colours); the folder glyph in the sidebar wears it, and the project's menu has a swatch row to change it later. Sidebar rows now breathe (3 px between rows).
- **Quick open with folders** — Ctrl+P groups files under their folder and lists matching folders first; picking a folder narrows the query to its contents.
- **Sounds, redone** — cues are played by a small synthesised mallet instrument (inharmonic partials, a strike transient, a lowpass, a convolution room, a limiter) instead of raw sines: "done" is a rising major triad left to ring, "needs you" a soft doorbell, toasts get short taps; three timbres in Settings › Notifications (Glass, Marimba, Pop) with a preview.
- **The entrance** — once per launch (Settings › General, or the checkbox on the screen): the mascot waving, "Good afternoon · Hi, <git user.name>", the numbers of what lives here (projects, Claude sessions with cost and tokens, files written by agents, notes, terminals, spent today), the AIs at hand with Claude's real plan windows as arcs, the current project's **commit map** (GitHub-style, a year, with the streak), recent projects and sessions. Without a repository the map shows the days worked inside Zpace instead (session activity, notes, terminals). The map scales to its card; the title bar stays usable so the window can be moved or maximized while it is up. Enter or the button on the left gets in.
- **Explorer file management** — new file / new folder (header buttons or the context menu, grouped in submenus: New ▸, Ask an agent ▸, System ▸; inline naming). The project menu (⋯ / right-click) is grouped the same way — Agents ▸, New ▸, board / files / git, rename + colour, System ▸ — and so are session rows (Open, Agent ▸ with stop / continue in Claude's terminal / model, Organize ▸ with rename, pin, duplicate, archive, copy session id) and terminal rows (Run here ▸ with another terminal or any installed agent in that folder, Organize ▸ with rename, reveal, copy path), rename (F2), delete to the Recycle Bin (never a hard delete; `trash` crate), sort by name or type; an open file follows its rename. Quick open (Ctrl+P) and Spotlight offer to **create** a file or folder that does not exist yet (`notes/todo.md`, `src/api/`).
- **Search-engine answers, integrated** — "Answer with Google AI Mode" (or Copilot / Brave / Perplexity / Kagi) loads the engine's answer page in a hidden child webview, a page script lifts out the answer's text blocks and the sources it cites (through the title channel, `conduit-data:`), and the bar renders them in its own style with source chips, copy, "open in the browser" and "ask Claude instead". Never automatic: you press Enter on the row. While it thinks: an orbiting mark, shimmering lines and the phase it is in.
- **Git avatars & undocking** — commits show their author's face (GitHub noreply ids and logins, the users search, Gravatar, then initials in a colour); the git sheet can be undocked into a workspace pane. Commit toasts carry the committer's avatar.
- **Pane zoom** — Ctrl+Shift+Enter, the maximize button, or a double-click on a pane header shows that pane alone (the browser "en pantalla grande"); again to restore.
- **Browser that remembers** — the browser pane belongs to a project: its last page is remembered (per project, across restarts), "Open browser here" returns to it, and the sidebar lists it under the project with the site's favicon. Child webviews now have WebView2's password autosave and autofill on, so logins are offered to be saved.
- **Safety net** — error boundaries around the title bar, sidebar, workspace, every pane, the git panel and the entrance: a render error shows a small card with "Try again" instead of a blank window.
- **Window stack (Ctrl+Tab)** — every open pane as a card in a deck: the active one in front (scale 1), the next at 0.96 / ±35px / 10px, the third at 0.92 / ±65px / 20px, springs between; Ctrl+Tab rotates, releasing Ctrl (or Enter, or a click) switches, Escape cancels. Cards show the pane's kind, title, project and a glimpse of its content.
- **Shortcuts inside the browser** — the app's shortcuts (Ctrl+Space, Ctrl+K, Ctrl+B, Ctrl+Tab…) work while an embedded page has the keyboard: an initialization script in every child webview catches them and hands them to the host (through a title change — the one channel a remote page has without IPC), Rust gives the keyboard back to the main webview and the host replays the key.
- **Agents that cannot start say so** — a program tab whose binary is missing or dies at once shows an error toast (with the last output line) and closes itself instead of leaving a dead PowerShell; npm-style `.cmd` / `.ps1` shims (`claude`, `opencode`) are started through their interpreter, and detection prefers the `.cmd` next to an extension-less shim.
- **Real plan limits** — the title-bar gauge reads Anthropic's own `/api/oauth/usage` endpoint (the one behind the CLI's `/usage`) with the login Claude Code keeps in `~/.claude/.credentials.json` — the token stays in Rust (`claude_usage`), nothing else is sent. 5-hour and weekly windows (and per-model ones when the plan has them) with reset countdowns, the plan badge (Pro / Max), a reading on show, every minute, and when the panel opens; clear messages when not signed in or the login expired.
- **Model switch that takes effect** — the footer's model label opens a picker (known aliases with their context size, or any model id typed by hand); like `/model`, it drops the running process so the next message resumes the same conversation with `--model`.
- **Search engine answers inside Spotlight** — a question in the bar (ends with "?" or starts with a question word) opens the engine's AI answer right there, embedded: Google AI Mode (`udm=50`), Copilot Search, Brave answers, Perplexity, Kagi's quick answer — a native child webview positioned over the panel, like the browser pane. "Open in the browser" moves it to a pane; "Ask Claude" still answers locally with a fast model in a hidden session you can continue in the chat.
- **Review what the agent changed** — a "N files to review" chip in the session footer (and "Review changes" on the island when Claude finishes) opens a pane: files with +/− on the left, the diff as hunks on the right, **Keep / Discard** per hunk, per file or all at once (side-by-side in Monaco too). The baseline is the file as it was when the session first read or wrote it (`src/stores/review.ts`); a discard writes the old lines back (a created file goes to the bin), a keep moves the baseline.
- **Selection bar in the editor** — select code and a floating bar offers Ask Claude (Ctrl+K), Claude Code in a terminal with this code, the other installed agents, search on your engine, copy / cut — no right-click needed.
- **The island, live** — while an agent works the pill says what it is doing and on what ("Editing Composer.tsx", "Running npm test"), and how many others are busy; click goes to that session.
- **Queue** — Enter while the agent works (or Alt+Enter any time) lines the message up; the list above the composer reorders, sends now or removes; the next one goes out the moment the turn ends (`src/stores/queue.ts`, `queue-runner.ts`).
- **Costs by project and the day summary** — a ledger (`src/stores/ledger.ts`) records every usage increase per day and project; the limits popover shows the week per project and fourteen days of columns, and "Day summary" (palette) sums spend, turns, commits today, files written, notes and terminals, per project, with "Save as note".
- **Global text search** — Ctrl+Shift+F also searches inside the projects' files (Rust `search_text`: parallel readers, binary / cloud-placeholder skipping, a time budget per project); a hit opens the file at the line, and "Ask Claude about these matches" hands them over as `@file#Lline` references.
- **Automations** — Settings › Automations: when files change under a path (Rust `notify` watcher, batched), every N minutes or daily at a time → send Claude a prompt (`{files}` = what changed) or run a command and, if it fails, hand Claude the failing output. Results land on the island.
- **Worktree sessions** — "New session in a worktree…" (project menu › Agents) creates `<parent>/<project>.worktrees/<branch>` with `git worktree add`, the session runs Claude there (its own branch), the explorer and the git panel follow it, and "Remove worktree" in the session menu cleans up.
- **MCP servers** — Settings › MCP servers lists the user's (`~/.claude.json`), the project's (`.mcp.json`) and the local ones with the status and tool count the running session reports; project servers can be added and removed (the file is rewritten).
- **Saved layouts** — "Save layout as…" keeps the pane tree and side panels per project; "Layout: name" or Ctrl+Alt+1…9 brings it back (panes whose session is gone come back empty); ready-made ones: chat + review + explorer, chat + terminal, three terminals.
- **Clipboard history and snippets** — what you copy (in the app, or elsewhere when the window regains focus) is in the palette as "Clipboard: …"; snippets ("Save a snippet…") insert from the palette or with `/snippet:name` in the chat.
- **Theme packs** — Settings › Appearance: Zpace, Catppuccin Mocha / Latte, Dracula, Nord, Gruvbox, One Dark, Tokyo Night, Solarized Light, GitHub Light — one click dresses the tokens, the terminal scheme and the editor alike (`src/features/appearance/packs.ts`).
- **Tray and updater** — a tray icon (left click brings the window back, menu shows / quits); "Close to the tray" in Settings › General; Tauri updater wired with a signing key (`~/.tauri/zorynq.key`, public key in `tauri.conf.json`; endpoint `plugins.updater.endpoints` — point it at a release feed) with "Check for updates" in About and a quiet check at launch.
- **macOS folders** — project rows, the explorer, the new-project dialog and the entrance use the Big Sur folder, tinted with the project colour (`src/components/ui/MacFolder.tsx`).
- **Dictation and voice** — a mic in the composer (Ctrl+Shift+M) uses Windows' own speech recognizer (Rust `speech_recognize`; the Web Speech API is silent inside WebView2) — it needs Settings › Privacy › Speech and microphone access for desktop apps; "Say it out loud" speaks "Claude finished" / "needs you" with a system voice.
- **Terminal, tunable** — weight, letter spacing, bold-as-bright, minimum contrast, padding, background opacity, smooth scrolling, copy on select, right-click paste, bell (sound / flash), a startup command for shells and extra environment lines.
- **Lenses** — the file pane reads a file two ways (Alt+1/2): **Code** (Monaco, with the selection bar) and **Timeline** (every agent edit to the file as a step on a rail, rebuilt from the review baseline plus each edit's old/new text; see the change against the step before or the whole state, and put any version back on disk). **Margin** (Alt+M) is a column of notes pinned to line ranges, like a reviewer's pencil: select lines, write a note, ask Claude and the answer sits under it (a hidden quick session with the lines and the file for context; the session is disposed once it answers), resolve or delete; noted lines carry a gutter mark and a "lines moved" badge appears when the file drifts under a note (`src/stores/margin.ts`, `src/features/files/lens/`).
- **Custom agents** — personas on top of Claude Code (`src/stores/agents.ts`, `src/features/agents/`). Each one is a little creature of its own (the mascot's shape, colour and face), with a model, permission mode and effort, instructions, hard rules, links, background notes and a **library** of photos and documents copied into its own folder (`%APPDATA%/dev.conduit.app/agents/<id>/`, reachable to the session through `--add-dir`), the skills it should reach for, the MCP servers it may load (`--mcp-config` + `--strict-mcp-config`) and tool patterns allowed / blocked (`--allowedTools` / `--disallowedTools`); all of it becomes `--append-system-prompt` + flags on the session. Click an agent in the sidebar's **Agents** section to chat with it; sessions that speak as an agent wear its avatar. **Multi-agent rooms** (`RoomPane`, pane kind `room`) put several agents in one chat inside a project: a message goes to whoever is `@mentioned` (the composer offers the agents on `@`) or to everyone; each agent speaks through a hidden session of its own, hears what the others said since its last turn, and a reply that mentions another agent is passed on (two hops at most). Rooms are listed under their project. **Claude Code's own subagents** (`~/.claude/agents/*.md`, `<project>/.claude/agents/*.md`, plugins read-only) are listed under the agents and edited in place — frontmatter as fields (name, when to delegate, tools, model, permission mode) and the system prompt — with "make a Zpace agent from it" and, from a Zpace agent, "export as a subagent". Codex, Gemini and OpenCode only run as terminals, so custom agents run on Claude Code.
- **Agent arena** — "solve this N ways": the same task to 2–4 agents at once, each in its own git worktree and branch (`arena/<task>-vN` beside the project folder), each with its model and an angle (your call · the simplest thing · robust with tests · a different approach · performance · custom). The arena pane shows a card per variant (what it is doing, then its summary, files/+/−/cost/time), the files any of them touched with every variant's +/− beside, and the diff of the chosen file — one variant at a time or all side by side. **Choose** commits the worktree, merges the branch into the project (a conflict is backed out and reported), drops the other variants and keeps the winner's session going in the project folder; **Discard** drops a session, its worktree and branch. Opens from the composer (the swords button or `/arena`), the palette ("Agent arena…") or a project's "+" menu; arenas are listed under their project. Rust: `git_head`, `git_changes(base)`, `git_commit_all`, `git_merge` (`src/features/arena/`, `src/stores/arena.ts`).
- **Copied** — every copy (editor, chat, terminal) blinks a "Copied · first line" on the island; the pane header's magnifier finds inside the file for file panes.
- **Celebrations** — when Claude finishes, a commit lands or a push goes through, confetti bursts out of the mascot and it pulls a trick (burst / orbit / comet); the settings example fires one too.
- **Durable state** — layouts, snippets, clipboard history, automations, the ledger, notifications and the queue live in `zorynq-state.json` in the app data folder (tauri-plugin-store), not only in the WebView2 profile; the first read migrates what localStorage had.
- **The island** — a black pill with the Z and the name at the top centre of the window, the default home of every notification: what Claude finished (with the files it wrote and their +/− lines), commits, pushes (with the steps lighting up), errors and permission requests unfold inside it, the button included, then it folds back; a click opens the notification centre underneath (the last hundred, unread dot, clear). It is portaled above every layer — menus, popovers, dialogs, sheets — and the browser pane hides its native webview while the island unfolds over it (the overlay watcher looks for `data-island="open"`). Settings › Notifications › "Where they show" switches between the island, sileo toasts at the edge, or both; the preview button fires a full "Claude finished" example. Hold the pill for a moment and slide it left or right — it stays where you leave it (a magnet at the centre, never past the tabs or the window controls; `notifications.shift`).
- **The entrance hands over to the island** — the big tile on the welcome screen folds away and the Z flies up into the title bar when you enter (shared layout id).
- **The project "+" asks** — session (chat view), Claude Code here, a terminal in any detected shell (PowerShell 7, Windows PowerShell, Command Prompt, Git Bash, WSL distros — the default first), note, board or browser; the project menu's New ▸ Terminal lists the same shells.
- **Selected lines travel to the chat** — select a range in a file pane beside a session and the composer shows a chip (`name:12-30 · attached`); the message goes out with `@path#L12-30` and the code fenced below it, the way the IDE extension carries a selection into Claude Code. Click the chip to insert the reference into the text instead, or detach it; it follows the pane's project, collapses with the selection and clears when the file closes.
- **Limits along the top edge** — a 2px hairline across the very top of the window (under the same "show usage" switch) paints the 5-hour window — green, amber past 70 %, red past 90 % — with the weekly window as a fainter 1px line under it; hover for the numbers and reset times.
- **Engine logos, the real ones** — Google's four-colour G, Bing's gradient mark (the official asset), DuckDuckGo's white duck on its orange disc, Brave / Ecosia / Startpage / Perplexity / Kagi in their brand colours on white tiles.
- **Folder colours everywhere** — the project colour persists (SQLite `projects.color`) and paints every folder of the explorer too.
- **Binaries** — Settings › Agents & binaries lists Claude Code, Codex, Gemini CLI, OpenCode, Git and Node with version, path (click copies) and status, the detected shells, WSL distros and Nerd Fonts, with a re-detect button.
- **Browser search engine** — Settings › Browser: Google, DuckDuckGo, Bing, Brave, Ecosia, Startpage, Perplexity, Kagi (with logos) and a home page.
- **Ten languages, fully translated** — Settings › General › Language: system, English, Español, Português (Brasil), Français, Deutsch, Italiano, 日本語, 中文（简体）, 한국어, Русский. Every string the UI shows goes through `t('English source')` (`src/i18n/index.ts`); one dictionary per language in `src/i18n/<lang>.ts`, keyed by the English text so a missing key can never show a placeholder. Dates, numbers and relative times follow the language (`currentLocale()`), so does dictation. `npm run i18n:check` extracts every key from the source and fails when a dictionary misses one, carries an orphan, or drops a `{placeholder}` — run it after adding strings; `--fix` prints the missing keys per language ready to paste.
- **Git** — status, stage/unstage/discard, commit, push/pull/fetch, **branches** (list, filter, switch, create, delete), clone, working-tree diffs in Monaco, explorer decorations, auto-fetch.
- **Browser** — a native WebView2/WKWebView pane with address bar, back/forward/reload and "open in system browser".
- **Files** — explorer with lazy folders, quick open (Ctrl+P) over a real file index, Monaco viewer/editor with save.
- **Appearance** — light/dark/system, accent presets or custom colours per token, San Francisco (SF Pro / SF Mono) by default when installed with Inter / DejaVu fallbacks, 20+ bundled and system fonts, density, reduced motion.
- **Local only** — SQLite in the app data folder, bundled fonts and editor, no telemetry, no CDN.

## 1. Running it

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

Produces an NSIS installer (per-user) and an MSI. The window is undecorated (`tauri.windows.conf.json`) and draws its own caption buttons; drag regions use `data-tauri-drag-region`, double-click on them toggles maximize.

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

## 2. Architecture

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

## 3. Claude Code integration

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

Adding another agent means implementing `AgentProvider` (`startSession / sendMessage / cancel / resume / respondPermission / getUsage / getCapabilities / dispose`) plus an adapter from its wire format to `AgentEvent`; the UI does not change. `CodexProvider`, `GeminiProvider` and `OpenCodeProvider` are the intended next implementations.

---

## 4. Keyboard

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

---

## 5. Status of this iteration

Verified end-to-end inside the Tauri shell (typecheck, lint, Vite build, `cargo build`, Playwright walkthroughs over CDP): onboarding → terminal (ConPTY, PowerShell 7), notes with split preview, embedded browser (native child webview), git panel with branches on a real repository, appearance settings, plus a real `claude` stream-json turn with usage/cost in the footer and state restored from SQLite after a restart.

Later rounds added: Windows Terminal font/scheme detection + bundled Symbols Nerd Font, split fix, terminals/notes nested under projects, find-in-terminal, sidebar filter, global search over terminals, the vendored super-beautiful-toast engine with creation toasts, the notes chip with stickies, PTY environment sanitising, the Claude launch panel and model list, Codex / Gemini launchers with brand marks, the Tiptap note editor with the format bubble, boards (incl. the project board), file-type icons (simple-icons, CC0) in the explorer and quick open, "ask an agent about this file", browser screenshots, drag-to-split, the usage gauge, notification sounds, Ctrl + wheel terminal zoom, menus above dialogs, the font dropdown, the colour-picker throttle and the Spanish UI. Round 8: per-session CLI options from the composer (`/effort` and friends, applied by restarting the process with `--resume`), TUI-only commands handed to a Claude terminal that resumes the same session, the inline "ask about this code" card, a bigger palette, density that actually changes the row height, the Spotlight bar, agent marks on every ask entry with a default agent, agent-edited files highlighted in the explorer and the editor, Ctrl+click links into the browser pane, and the binaries panel. Round 9: OpenCode, media/hex viewers via the asset protocol, the branded editor context menu, the resizable terracotta inline card, project folder colours with a "New project" dialog, folder-grouped quick open, the synthesised sound engine with timbres, roomier sidebar rows and settings. Round 10: real plan limits from Anthropic, the model picker that restarts on the same conversation, search-engine AI answers embedded in Spotlight, real engine logos, persisted folder colours in the explorer. Round 11: sileo toasts with rich Claude / git content, the Ctrl+Tab window stack, shortcuts forwarded out of embedded pages, agent-start failures surfaced as toasts, the context meter kept at the last call's size. Round 12: the entrance screen with the dashboard and commit map, explorer file management, create-from-search, integrated engine answers, git avatars and undocking, pane zoom, per-project browser memory with saved logins, error boundaries, OpenCode's mark redrawn, mascot moods as a dropdown, grouped context menus with submenus (explorer, project, sessions, terminals), the selection chip that sends `@path#L12-30` with the message, the limits hairline at the top of the window, and store hydration that keeps what this launch created before SQLite answered (older localStorage copies never resurrect deleted rows). Round 13: renamed to **Zpace** with the Z logo (icons regenerated, the mark as a colourable CSS mask), the island notification centre, the project "+" chooser with shells, PTY output buffered until the terminal attaches (a TUI's first screen was lost when it painted before the tab wired up — "Open in Claude Code with this code" stayed blank), the editor's Command palette entry opening after the menu unmounts, session titles from the words typed rather than the `@file#L` mention, damaged project paths dropped on rehydrate. Round 15: dictation (WinRT), search content cache (a repeat search does not touch the disk), durable state file, release workflow (`.github/workflows/release.yml` builds signed installers and the updater manifest on a `v*` tag), worktrees from a base ("feature/x from main") and branch deletion on remove, the changes icon with a badge in session headers and the "All" mode of the review, the selection bar, the free colour picker for folders, the terminal tunables, the title bar gradient / grouped controls / entrance blend, the SVG commit map, celebrations, the rename to **Zpace** (binary `zpace.exe`). Round 14: the fifteen additions above (review pane, selection bar, live island, queue, ledger + day summary, text search, automations, worktrees, MCP panel, layouts, clipboard + snippets, theme packs, tray + updater, mac folders); settings deep-merge on every launch; the island above every layer and the browser hiding under it.

Next: system tray, Codex/Gemini/OpenCode adapters and image previews in the file pane.
