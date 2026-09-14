# Zpace — how we work on this repo

Zpace is a desktop workspace for coding agents (Claude Code first; Codex, Gemini CLI and OpenCode too): Tauri 2 + React 19 + TypeScript, Tailwind 4, zustand, `motion`, Radix (`radix-ui`), Monaco, xterm, Tiptap. Internal ids still say `conduit.*` / `zorynq` (old names) — leave them, they are persisted keys and binaries.

The owner is Nicolás Cabanillas (GitHub `Nicoo01x`, Argentina). Talk to him in Spanish, informal (vos). The UI is in English by default and translated into 10 languages.

## Commands

| What | How |
| --- | --- |
| Dev server (the app loads it on `127.0.0.1:1420`) | `npm run dev` |
| Type check (the real one) | `npx tsc -b` |
| Lint (eslint + tsc) | `npm run lint` — must be clean before you say something is done |
| Translations | `node scripts/i18n-check.mjs` (`--fix` prints the missing keys per language) — must report every dictionary complete |
| Rust | `cd src-tauri && cargo check` / `cargo build` (cargo lives in `~/.cargo/bin`). The running `zpace.exe` locks the binary: stop it before `cargo build`, relaunch after |
| Installers | `npm run tauri:build:win` / `:mac`; releases are built by `.github/workflows/release.yml` on a `v*` tag (needs the signing key secrets; the key is in `~/.tauri/`, never in the repo) |

There is no Prettier. Files are formatted by hand at a wide print width (~300 columns): long one-line JSX props are normal here; do not reflow files.

## Repo rules

- Commits: author **Nicoo01x** only (`Nicoo01x <76893296+Nicoo01x@users.noreply.github.com>`), no `Co-Authored-By` lines, no attribution footers. Short imperative subject, a body only when the why is not obvious.
- Never commit `node_modules`, `dist`, `src-tauri/target`, `src-tauri/gen`, logs, `.env*`, keys.
- Personal data stays out of the code, the docs and the screenshots: no real user names, machine names, absolute `C:\Users\…` paths, private sessions.
- `README.md` is the product's story; `CLAUDE.md` (this file) is for whoever works on the code with Claude.

## Code conventions

- **TypeScript everywhere, strict.** No `any`; narrow with types, not casts. React Compiler lint is on: keep hooks pure, no mutation of props/state.
- **Comments are prose.** A short `/** … */` at the top of a file says what it is and the one non-obvious decision. Inline comments explain *why*, in full sentences, lower-case after a dash. No comment that repeats the code.
- **Every user-facing string goes through `t()`** (`import { t } from '@/i18n'`); files that already have a local `t` import it as `tr`. Strings in tables/constants are wrapped in `T()` and translated where rendered. Placeholders are `{name}`. After adding strings, add them to all nine dictionaries (`src/i18n/*.ts`, alphabetical is not required — append) and run the check.
- **Stores** are zustand with `persist` and `durableStorage()` (a SQLite mirror in the app data folder, shared by every instance of the app). Always `partialize`, `version`, and a `migrate` when the shape changes. Selectors with `useShallow` must return primitives or stable objects — a fresh nested array/object every render loops forever.
- **Native calls** go through `src/native/*` wrappers (`invoke` in `native/bridge.ts`); Rust commands live in `src-tauri/src/commands/*` and are registered in `lib.rs`. Windows-only code is `#[cfg(windows)]` with a non-Windows stub.
- **Panes** are a `PaneContent` kind (`types/workspace.ts`) rendered in `components/layout/Workspace.tsx`, kept alive by `stores/layouts.ts`.
- Dev-only hooks: `window.__conduit` exposes the stores in DEV for automation; `__conduit.dev` for plugins.

## Design system

Tokens live in `src/styles/tokens.css` (light and dark): `--canvas`, `--background`, `--surface`, `--surface-inset`, `--surface-hover`, `--surface-active`, `--surface-raised`, `--text-primary` / `-secondary` / `-muted` / `-inverse`, `--accent`, `--accent-soft`, `--accent-warm`, `--border`, `--border-subtle`, `--border-strong`, `--success`, `--warning`, `--danger` (+ `-soft`). Use the Tailwind names that map to them (`bg-surface`, `text-secondary`, `text-danger`, `bg-accent-soft`…); never a literal colour in a component unless it is brand (`#D97757` Claude) or a theme pack.

- **Type**: `text-ui` (13.5px) for controls and rows, `text-content` for prose, `text-meta` for the small line under things. Explicit sizes are fine when they carry meaning: kickers are `text-[11px] font-medium uppercase tracking-[0.05em] text-muted`; titles `text-[15px] font-semibold tracking-[-0.01em]`; hints `text-[12px] text-secondary`. Numbers that line up get `tabular`.
- **Surfaces**: rows are `h-(--row-height)` and `rounded-lg`; cards `rounded-lg bg-surface shadow-[0_0_0_1px_var(--border)]` (a 1px ring, not a border); insets `bg-surface-inset`; dialogs `rounded-[14px]`; menus/popovers `bg-surface-raised shadow-popover backdrop-blur-xl`. Dividers are `hairline-b/t/l/r`, not `border-*`.
- **Controls**: use the primitives in `src/components/ui` (Button, IconButton, TextInput, Textarea, Select, SegmentedControl, Switch, DropdownMenu, ContextMenu, Popover, Tooltip, Dialog, Tabs, Progress, Living…). Never hand-roll a dropdown with `absolute` divs — the primitives already carry the motion, focus, and keyboard behaviour.
- **Not everything is a card.** One ring for the thing that is separate; lists are flat rows with hover states.
- **Empty states** are one quiet line in `text-muted`, centred, with the action inline ("Create one.").
- **Icons**: lucide, 13–15px in rows, `size-4` in headers. Brand marks come from `features/agent/BrandIcon.tsx` (real SVGs), agent avatars are Bloub creatures (`features/mascot`), never emoji.
- **Light and dark** always; a theme pack (`features/appearance/packs.ts`) sets colours + terminal scheme + editor colours together.
- **Consume as little as possible**: no idle polling (poll only while something is happening or a pane is open, and skip when `document.hidden`), animation loops capped (the mascot runs at 30 fps), network fetches cached for the session.

## Motion — the living layout

Everything moves by transform and opacity; **nothing animates height**. Presets are in `src/lib/motion.ts` (`springs.living` 420/34/0.8 for layout, `springs.snappy` for hover/press, `springs.pop` for menus, `springs.modal` for dialogs; the `living` variants and `easings`). The primitives are in `src/components/ui/Living.tsx`:

- `LivingGroup` = one layout scope (`LayoutGroup`).
- `LivingBox` = a container that changes size (a row that opens a form). It springs between sizes; it clips only while moving; it must keep some permanent content (a box that collapses to 0px cannot be projected).
- `LivingReveal open={…}` = the conditional content inside a box: fades in from 4px above; on close it pops out of the flow at once (`popLayout`) so siblings start moving immediately. Its parent needs `relative`.
- `LivingItem` = a row that moves with the layout (position only) and fades in/out; `still` for rows already there at first paint. `LivingList` = the `AnimatePresence popLayout` wrapper for keyed items.
- `LivingSwitch k={…}` = content that swaps by key (a settings section, a form whose fields depend on a choice). `Swap k={…}` = an inline swap that must keep its place in a row (a label that becomes an input).
- `LivingField` = a form field that just appeared (staggered by `index`). `Turn open={…}` = a chevron that rotates.
- Buttons get the `press` utility (`globals.css`) for press physics — never together with `transition-*` utilities on the same element.
- Menus, popovers, tooltips and dialogs animate through the primitives (`popoverVariants`, the dialog morphs from the element that opened it via `consumeOrigin`). Interrupting any animation (open → close → open) must continue from where the element is; never `mode="wait"`.
- Respect reduced motion (`useReducedMotion` / `MotionConfig`): fade only.
- The transcript (virtualised list) is the one exception: it keeps the height-driven `Collapsible`.
- Springs that overshoot go past 1: clamp anything derived from them that must not go negative (a `blur()` with a negative value is invalid CSS and flickers).

**Every expander, dropdown, form and inline field that opens must animate.** If you add a `{open ? <X/> : null}`, wrap it.

## i18n

`src/i18n/index.ts` holds `LANGUAGES` (native names), `LOCALES`, `t()`, `T()`, `currentLocale()`. Dictionaries are `en` (source, empty) plus es, pt-BR, fr, de, it, ja, zh-CN, ko, ru. Spanish is Río de la Plata (vos). Dates/numbers use the active locale. The chrome re-mounts on a language change (keys in `App.tsx`); anything that must survive that lives in a store, not React state (the onboarding wizard's step is a small zustand store for that reason).

## Plugins

`src/features/plugins/`: `manifest.ts` (types, `validateManifest`, `registryRaw()` — a dev override `localStorage['zpace.registry']` points at a local copy of the registry), `registry.ts` (fetch index, install = fetch text files → `<appData>\plugins\<id>`, apply contributions, activate; uninstall takes everything back), `runtime.ts` (the `zpace` API given to scripts, permission-gated by the manifest; `pluginCommands()` and `pluginPacks()` feed the palette and the theme list), `PluginPane.tsx` (a sandboxed srcdoc iframe with a `window.zpace` bridge over postMessage), `PluginsSection.tsx` (Settings › Plugins). Island readouts from plugins are `features/island/chips.ts`. The registry is the separate repo `Nicoo01x/zpace-plugins` (its README documents the manifest and the whole API — keep the two in sync when the API changes).

## Testing what you built

- Automation runs against a second instance of the app: spawn `src-tauri/target/debug/zpace.exe` with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9426` and its own `WEBVIEW2_USER_DATA_FOLDER`, connect with Playwright `connectOverCDP`, drive the stores through `window.__conduit`. Clean the environment first (`NO_COLOR`, `CLAUDE*`, `WT_*` unset) or the CLIs misbehave.
- The SQLite mirror is shared with the instance the user is looking at: snapshot what you touch (projects, settings, notifications) and restore it from fresh state at the end; never leave demo projects in the user's DB.
- The browser pane is a native child webview: it is invisible to CDP screenshots — use `capture_region_to_file` (a screen grab) with the window at a known size.
- Playwright injects a script into sandboxed iframes that throws `reading 'plugins'`; raw CDP shows the app clean. Do not chase it.
- Verify with screenshots, not assumptions: open the thing, look at it, then say it works.

## Product decisions already made (do not re-open)

- White/light default, blue accent; the island (notification centre in the title bar) is the default surface for news; toasts are optional.
- The mascot is a Bloub creature (shapes × colours × expressions), lives in the title bar, follows the pointer, reacts to agents.
- Agents = personas on top of Claude Code (instructions, rules, knowledge, library, skills, MCP, tools); rooms are multi-agent chats with `@` mentions; the arena races variants in worktrees.
- Free forever, local-first: no accounts, no cloud, nothing leaves the machine unless the user asks (updates from GitHub releases; plugins from the registry; the About section shows the author's GitHub avatar).
- First run is the six-step wizard in `features/settings/Onboarding.tsx` (language → name → theme packs + accent → mascot → tools → done with "Follow on GitHub").
- The promo video lives in a separate Remotion project (`remotion-video`), not here.
