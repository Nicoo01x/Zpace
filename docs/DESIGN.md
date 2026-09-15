# The Zpace design system

Everything the interface is made of — colours, type, surfaces, controls, motion, the island, the mascot — and where each piece lives in the repository. The rules were set one by one while building the app; they are written here so the next screen looks like the last one.

The short version: **white by default, one blue, one ring around the thing that is separate, every row 34 px, everything that opens animates by transform and opacity, nothing animates height, no emoji as icons.**

---

## 1. Colour

Tokens live in [`src/styles/tokens.css`](../src/styles/tokens.css) (light on `:root`, dark on `.dark`) and are exposed to Tailwind as `bg-surface`, `text-secondary`, `text-danger`, `bg-accent-soft`… Components never carry a literal colour; the two exceptions are brand marks (`#D97757` Claude) and theme packs.

| Token | Light | Used for |
| --- | --- | --- |
| `--canvas` | `#f4f4f2` | the window, the sidebar, the title bar |
| `--background` | `#fcfcfb` | the workspace card |
| `--surface` / `--surface-raised` | `#ffffff` | popovers, inputs, cards |
| `--surface-hover` / `-active` / `-inset` | black at 4.5 % / 7 % / 3.5 % | row hover, selected row, insets |
| `--border` / `-strong` / `-subtle` | black at 8 % / 14 % / 5 % | the ring around cards, dividers |
| `--text-primary` / `-secondary` / `-muted` | `#1d1d1f` / `#6e6e73` / `#9c9ca1` | body, secondary line, hints and kickers |
| `--accent` / `--accent-soft` | `#2f6fde` / 12 % | links, code refs, the selected thing |
| `--accent-warm` | `#d97a45` | grips, context bars, activity |
| `--claude` | `#d97757` | Anthropic's terracotta: the inline ask card, Claude-only controls |
| `--success` / `--warning` / `--danger` / `--info` | `#2c8a55` / `#b8791f` / `#d4443b` / `#3b7dd8` | states, each with a `-soft` tint |
| `--note-paper` / `--note-paper-strong` / `--note-ink` | white / `#ffe98c` / `#3d3200` | sticky notes (white sheet, yellow header) |
| `--diff-add` / `--diff-del` | green 16 % / red 14 % | review and editor diffs |
| `--overlay` | `rgba(20,20,18,.28)` | behind dialogs |

Radii: `--radius-xs` 4, `-sm` 6, `-md` 8, `-lg` 10, `-xl` 14. Shadows: `--shadow-card` (a 1 px ring + a hairline), `--shadow-popover`, `--shadow-window`, `--shadow-toast`.

**Theme packs** ([`src/features/appearance/packs.ts`](../src/features/appearance/packs.ts)) set the colours, the terminal scheme and the editor colours together: `zorynq-light` (default), `zorynq-dark`, `catppuccin-latte`, `catppuccin-mocha`, `dracula`, `nord`, `gruvbox-dark`, `one-dark`, `tokyo-night`, `solarized-light`, `github-light` — plus any pack a plugin contributes (`rose-pine`, `monokai-pro` in the registry). Light and dark always both work.

## 2. Type

| Role | Value | Where |
| --- | --- | --- |
| UI stack | `SF Pro Text`, `-apple-system`, `Inter Variable`, `Segoe UI`, sans-serif | `--font-sans` |
| Mono stack | `SF Mono`, `Menlo`, `JetBrains Mono Variable`, `Cascadia Code`, `Consolas` | `--font-mono` — code, the transcript, the terminal |
| Terminal glyphs | Windows Terminal's configured face when present, else the UI mono, always with a bundled *Symbols Nerd Font Mono* fallback | [`src/styles/fonts.css`](../src/styles/fonts.css), `src/assets/fonts/` |
| Sizes | `text-ui` 13.5 px (controls, rows) · `text-content` 13.5 px (prose; the conversation is mono) · `text-meta` 12 px (the small line under things) · terminal 13 px | `--font-size-*` |
| Kicker | 11 px, medium, uppercase, `tracking-[0.05em]`, `text-muted` | section labels ("PROJECTS", "THE ISLAND") |
| Title | 15 px, semibold, `tracking-[-0.01em]` | dialog and pane titles |
| Hint | 12 px, `text-secondary` | under a field |
| Numbers | `tabular` | anything that lines up: counts, times, costs |
| Density | `--row-height` 34 px (compact 29, comfortable 40); title bar 34 px | Settings › Appearance |

The website ([`site/index.html`](../site/index.html)) uses **Inter** (400–800) and **JetBrains Mono** from Google Fonts on purpose — the same faces the app falls back to, so the page and the product read as one thing.

## 3. Surfaces

- **Rows** are `h-(--row-height) rounded-lg`, flat, with `bg-surface-hover` on hover and `bg-surface-active` when selected. Sidebar rows breathe 3 px apart.
- **Cards** are `rounded-lg bg-surface shadow-[0_0_0_1px_var(--border)]` — a 1 px ring, never a border. *Not everything is a card*: one ring for the thing that is separate, lists are flat rows.
- **Insets** (a well inside a card) are `bg-surface-inset`.
- **Dialogs** are `rounded-[14px]`; **menus, popovers and tooltips** are `bg-surface-raised shadow-popover backdrop-blur-xl`.
- **Dividers** are the `hairline-b/t/l/r` utilities ([`src/styles/globals.css`](../src/styles/globals.css)), not `border-*`.
- **Empty states** are one quiet line in `text-muted`, centred, with the action inline: "Create one."
- **Icons** are lucide, 13–15 px in rows, `size-4` in headers. Brand marks are the real SVGs in [`src/features/agent/BrandIcon.tsx`](../src/features/agent/BrandIcon.tsx) (Claude, OpenAI/Codex, Gemini, OpenCode); plugin icons are the registry's SVG tiles; agent avatars are Bloub creatures. **Never an emoji as an icon** — island readouts take an inline SVG for that reason.

## 4. Controls

All in [`src/components/ui/`](../src/components/ui): `Button`, `IconButton`, `TextInput`, `Textarea`, `Select`, `SegmentedControl`, `Switch`, `Tabs`, `Badge`, `StatusDot`, `ColorDot`, `Progress`, `Spinner`, `Shortcut`, `Grip`, `Divider`, `ScrollArea`, `VirtualList`, `Collapsible`, `Tooltip`, `Popover`, `DropdownMenu`, `ContextMenu`, `Dialog`, `PromptDialog`, `Sheet`, `ErrorBoundary`, `MacFolder`, and the motion primitives in `Living.tsx`. Menus share one look through `menu-styles.ts` (grouped items with submenus: New ▸, Agents ▸, Organize ▸, System ▸).

Never hand-roll a dropdown out of `absolute` divs — the primitives carry the motion, the focus ring, the keyboard behaviour and the dark theme.

## 5. Motion — the living layout

Presets in [`src/lib/motion.ts`](../src/lib/motion.ts); primitives in [`src/components/ui/Living.tsx`](../src/components/ui/Living.tsx). The principle: **everything moves by transform and opacity, nothing animates height**, and an interrupted animation continues from where the element is (never `mode="wait"`).

### Springs and eases

| Name | Stiffness / damping / mass | For |
| --- | --- | --- |
| `springs.living` | 420 / 34 / 0.8 | layout: rows moving, boxes changing size |
| `springs.snappy` | 640 / 42 / 0.8 | hover, press, chips |
| `springs.pop` | 520 / 34 / 0.9 | menus and popovers |
| `springs.modal` | 380 / 30 / 1 | dialogs, the island |
| `springs.toast` | 300 / 26 / 1 | toasts |
| `springs.layout` / `springs.size` | 560 / 40 / 0.9 · 700 / 46 / 0.9 | shared-element moves, size changes |
| `durations` | instant 80 ms · fast 120 · normal 180 · slow 260 | CSS `--motion-*` too |
| `easings.out` | `[0.22, 1, 0.36, 1]` (quint) | crisp arrivals |
| `easings.inOut` / `.spring` / `.soft` | `[0.65,0,0.35,1]` · `[0.56,0.27,0,1]` · `[0.37,0.35,0,1]` | exits · the dialog morph · blur-ins |

### Primitives

| Primitive | What it does |
| --- | --- |
| `LivingGroup` | one layout scope (a `LayoutGroup`) — the sidebar, a settings page |
| `LivingBox` | a container that changes size (a row that opens a form): springs between sizes, clips only while moving; it must keep some permanent content — a box that collapses to 0 px cannot be projected |
| `LivingReveal open` | the conditional content inside a box: fades in from 4 px above; on close it pops out of the flow at once (`popLayout`) so siblings start moving immediately (parent needs `relative`) |
| `LivingItem` / `LivingList` | a row that moves with the layout (position only) and fades in/out; `still` for rows already there at first paint; the list is the `AnimatePresence popLayout` wrapper |
| `LivingSwitch k` | content that swaps by key — a settings section, a form whose fields depend on a choice |
| `Swap k` | an inline swap that keeps its place in a row — a label that becomes an input |
| `LivingField index` | a form field that just appeared, staggered 20 ms per index |
| `Turn open` | a chevron that rotates |

**Every expander, dropdown, form and inline field that opens must animate.** If a `{open ? <X/> : null}` appears, it gets wrapped. Applied everywhere: sidebar sections and lists, project groups, the explorer tree, review rows, note tags, MCP forms, arena cards, automations, settings sections, rename inputs, the room's `@` list, the git tabs, the inline ask card.

### Buttons, menus, dialogs, toasts

- Buttons carry the `press` utility (`globals.css`): scale on press with a `linear()` spring-out ease, colour and shadow at `--motion-fast` — never combined with `transition-*` utilities on the same element.
- Popovers, menus and tooltips use `popoverVariants`: hidden `opacity 0 · scale .94 · blur 4px · y −4` → visible, exit in 140 ms. Inside a popover, rows are plain (no `LivingList`): a `layout` child keeps projecting while the parent scales out and the popover never unmounts.
- Dialogs morph from the element that opened them (`consumeOrigin` in `motion.ts`, `Dialog.tsx`): the trigger's rectangle is the first frame.
- Toasts (optional, off by default) are the vendored *sileo* engine in [`src/features/notifications/`](../src/features/notifications) with rich content (touched files, deploy steps) and three synthesised timbres — Glass, Marimba, Pop ([`sound.ts`](../src/features/notifications/sound.ts): inharmonic partials, a strike transient, a lowpass, a convolution room, a limiter).
- Reduced motion (`useReducedMotion`) means fade only.
- Springs overshoot past 1: anything derived from them that must not go negative is clamped — a `blur()` with a negative value is invalid CSS and flickers (that was the promo's text flicker).
- The transcript (a virtualised list) is the one place that keeps a height-driven `Collapsible`.

### The window stack and the entrance

- **Ctrl+Tab** shows every pane as a card in a deck: the active one at scale 1, the next at 0.96 / ±35 px / 10 px, the third at 0.92 / ±65 px / 20 px, springs between ([`src/features/switcher/`](../src/features/switcher)).
- **The entrance** ([`src/features/welcome/`](../src/features/welcome)): the Z assembles from three clip-path strokes, then "Zpace" pulls together letter by letter; the mark then flies into the island as a shared element (`layoutId`).

## 6. The island

[`src/features/island/Island.tsx`](../src/features/island/Island.tsx) — the notification centre in the title bar, the default surface for news (toasts are optional).

- **Compact**: a dark pill (`#111`, radius 15, white text, a 1 px white ring at 6 %): the Z mark (12 px) + "Zpace" (12 px semibold) + an accent dot when something is unread; while an agent works, what it is doing right now; then the plugin **readouts** ([`chips.ts`](../src/features/island/chips.ts)) — a countdown, the track playing, the weather — 11.5 px, separated by hairlines, each with a single glyph or an inline SVG icon. It measures the room between the title-bar groups (`useIslandRoom`) and readouts step aside one by one in a narrow window.
- **Unfolded** (a *bloom*): radius 18, the brand row, then glyph · title · summary · rich content · a button; folds after 5.2 s (8 s with rich content, 9 s for warnings and errors). A plugin card (`zpace.island.show`) is the same shape with an image as the glyph and a row of pill buttons (white primary, white-at-12 % secondary).
- **Centre**: click the pill and every notification is kept, newest first.
- It springs with `springs.modal`, can be dragged along the title bar (hold, then move; magnetises back to centre), sits above every layer (`z-[1400]`), and hides the browser's native webview while it is open.

## 7. The mascot

[`src/features/mascot/`](../src/features/mascot) — the vendored **bloub** engine (MIT). A creature = shape × colour × expression, drawn as SVG at 30 fps, eyes on the pointer, moods from the agents (thinking, alert when it needs you, notify when done, asleep when you are away), a trick on click.

- Shapes: `cercle`, `galet`, `squircle`, `capsule`, `triangle`, `hexagone`, `nuage` (default), `goutte`.
- Colours: `encre`, `brun`, `rouge`, `orange`, `ambre`, `vert`, `turquoise`, `bleu`, `violet`, `rose`, `gris`, `creme`.
- Expressions: `neutre` (default), `attentif`, `surpris`, `excite`, `heureux`, `hilare`, `colere`, `triste`, `effraye`, `mefiant`, `confus`, `curieux`, `fier`, `timide`, `blase`, `somnolent`.
- Lives in the title bar, a corner, the sidebar or only the entrance (Settings › Mascot). Agent avatars are frozen Bloubs — the same engine, never emoji.

## 8. Product rules that shape the design

- White/light default, blue accent; the island is where news goes; toasts are opt-in.
- One window: the pane is the unit ([`src/components/layout/Workspace.tsx`](../src/components/layout/Workspace.tsx)); drag to split, Ctrl+Shift+Enter to zoom a pane.
- Free forever, local-first: nothing in the UI asks for an account.
- Every user-facing string goes through `t()` and into all nine dictionaries ([`src/i18n/`](../src/i18n)); Spanish is Río de la Plata (vos).
- Consume as little as possible: no idle polling, the mascot at 30 fps, fetches cached for the session, the usage chip every 5 minutes and never while the window is hidden.
- Plugins ([`src/features/plugins/`](../src/features/plugins)) follow the same language: library cards with the author's avatar, readouts and cards in the island, panes themed with the app's CSS variables, the plugin's own icon in pane headers, in the sidebar and in the title-bar chip.

## 9. The website and the video

- **Landing** ([`site/index.html`](../site/index.html), deployed by [`pages.yml`](../.github/workflows/pages.yml)): the same tokens (`--canvas`, `--accent`), Inter + JetBrains Mono, GSAP 3 + ScrollTrigger + Lenis. Word-masked headings that rise; the app window that flattens from a 12° tilt as you scroll, with floating chips at different parallax speeds; the mascot (the real SVG, captured from the app) breathing and leaning toward the pointer; a pinned marquee of giant words dragged by the scroll; a pinned feature stack whose screenshot swaps per step; the island rebuilt in CSS and scrubbed by a pinned timeline (pill → clock readout → track → card); cards that tilt toward the pointer; plugin cards popping in with a stagger; "Free. Forever. Local." slammed in with a random tilt; downloads filled from the releases API with OS detection. Reduced motion shows everything still.
- **Promo** (`remotion-video/`, separate project): Remotion 4, 1080p30, 68 s. Springs `FAST` 260/18/0.7, `SNAP` 320/14/0.6, `GLIDE` 140/26/1; the same white stage and blue; Edge neural voice *Andrew* at +14 %; a synthesised 120 BPM F-major bed with a drop; whooshes, pops, ticks and chimes; typing is a slice of a real keyboard recording. Scenes: hook → meet → dashboard → chat → edit → island → plugins → agents → room → arena → more → outro.
