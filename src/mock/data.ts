import type { AgentEvent } from '@/types/agent';
import type { Project, Session } from '@/types/workspace';
import { modelLabel } from '@/stores/settings';

/**
 * Seed data used on first launch (and in the browser dev preview) so the
 * interface can be evaluated against the reference screenshot.
 */

const now = Date.now();
const min = 60_000;

export const mockProjects: Project[] = [
  {
    id: 'prj_money',
    name: 'money',
    path: 'C:\\Users\\dev\\projects\\money',
    runtime: 'windows',
    lastOpenedAt: now - 3 * 60 * min,
    createdAt: now - 40 * 24 * 60 * min,
    expanded: false,
    git: { branch: 'main', dirty: 0, ahead: 0, behind: 0, isRepo: true },
  },
  {
    id: 'prj_luisdavid',
    name: 'luisdavid',
    path: 'C:\\Users\\dev\\projects\\luisdavid',
    runtime: 'windows',
    lastOpenedAt: now - 26 * 60 * min,
    createdAt: now - 30 * 24 * 60 * min,
    expanded: false,
    git: { branch: 'main', dirty: 2, ahead: 1, behind: 0, isRepo: true },
  },
  {
    id: 'prj_melon',
    name: 'melon-mind',
    path: 'C:\\Users\\dev\\projects\\melon-mind',
    runtime: 'windows',
    lastOpenedAt: now - 2 * min,
    createdAt: now - 12 * 24 * 60 * min,
    expanded: true,
    git: { branch: 'feature/documents-table', dirty: 4, ahead: 2, behind: 0, isRepo: true },
  },
  {
    id: 'prj_sbt',
    name: 'super-beautiful-toast',
    path: 'C:\\Users\\dev\\projects\\super-beautiful-toast',
    runtime: 'wsl',
    wslDistro: 'Ubuntu',
    lastOpenedAt: now - 2 * 24 * 60 * min,
    createdAt: now - 60 * 24 * 60 * min,
    expanded: false,
    git: { branch: 'main', dirty: 0, ahead: 0, behind: 3, isRepo: true },
  },
];

function session(partial: Partial<Session> & Pick<Session, 'id' | 'projectId' | 'title'>): Session {
  return {
    providerId: 'claude-code',
    model: 'opus',
    modelLabel: modelLabel('opus'),
    status: 'idle',
    activity: 'idle',
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, contextUsed: 0, contextMax: 1_000_000, costUsd: 0 },
    runtimeMs: 0,
    createdAt: now - 60 * min,
    updatedAt: now - 60 * min,
    pinned: false,
    archived: false,
    dirtyFiles: 0,
    ...partial,
  };
}

export const MOCK_ACTIVE_SESSION_ID = 'ses_melon_arch';

export const mockSessions: Record<string, Session> = {
  ses_money_1: session({ id: 'ses_money_1', projectId: 'prj_money', title: 'Refactor budget importer', updatedAt: now - 3 * 60 * min, status: 'completed' }),
  ses_luis_1: session({ id: 'ses_luis_1', projectId: 'prj_luisdavid', title: 'Landing hero copy + responsive fixes', updatedAt: now - 26 * 60 * min, status: 'completed' }),
  [MOCK_ACTIVE_SESSION_ID]: session({
    id: MOCK_ACTIVE_SESSION_ID,
    projectId: 'prj_melon',
    title: 'Arquitectura de tabla de documentos con secciones ocultas',
    status: 'completed',
    usage: {
      inputTokens: 84_120,
      outputTokens: 18_140,
      cacheReadTokens: 61_400,
      cacheWriteTokens: 12_800,
      contextUsed: 102_260,
      contextMax: 1_000_000,
      costUsd: 2.33,
    },
    runtimeMs: 14 * min + 12_000,
    updatedAt: now - 2 * min,
    createdAt: now - 3 * 60 * min,
    dirtyFiles: 3,
  }),
  ses_melon_docs: session({
    id: 'ses_melon_docs',
    projectId: 'prj_melon',
    title: 'DocumentsTable.vue — virtualización y filtros',
    status: 'running',
    activity: 'editing',
    runStartedAt: now - 3 * min,
    usage: { inputTokens: 21_000, outputTokens: 4_200, cacheReadTokens: 12_000, cacheWriteTokens: 3_000, contextUsed: 38_400, contextMax: 1_000_000, costUsd: 0.71 },
    updatedAt: now - 20_000,
    createdAt: now - 2 * 60 * min,
    dirtyFiles: 1,
  }),
  ses_melon_deploy: session({
    id: 'ses_melon_deploy',
    projectId: 'prj_melon',
    title: 'Production deployment setup',
    status: 'waiting',
    activity: 'waiting',
    runStartedAt: now - 9 * min,
    usage: { inputTokens: 40_000, outputTokens: 9_000, cacheReadTokens: 22_000, cacheWriteTokens: 4_000, contextUsed: 61_200, contextMax: 1_000_000, costUsd: 1.12 },
    updatedAt: now - 5 * min,
    createdAt: now - 60 * min,
  }),
  ses_sbt_1: session({ id: 'ses_sbt_1', projectId: 'prj_sbt', title: 'Spring physics tuning for stacked cards', updatedAt: now - 2 * 24 * 60 * min, status: 'completed' }),
};

const t0 = now - 48 * min;
let seq = 0;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EventInput = DistributiveOmit<AgentEvent, 'id' | 'sessionId' | 'timestamp'> & { at: number };
function ev(partial: EventInput): AgentEvent {
  const { at, ...rest } = partial;
  seq += 1;
  return { id: `ev_${seq}`, sessionId: MOCK_ACTIVE_SESSION_ID, timestamp: t0 + at, ...rest } as AgentEvent;
}

/** Tiny inline placeholder so the attachment row and lightbox can be exercised offline. */
const MOCK_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#f4f4f2"/><rect x="0" y="0" width="640" height="56" fill="#ffffff"/><g fill="#d5d5d2"><rect x="24" y="20" width="90" height="16" rx="4"/><rect x="130" y="20" width="70" height="16" rx="4"/><rect x="216" y="20" width="80" height="16" rx="4"/><rect x="312" y="20" width="110" height="16" rx="4"/></g><g fill="#e6e6e3"><rect x="24" y="88" width="592" height="64" rx="8"/><rect x="24" y="168" width="592" height="64" rx="8"/><rect x="24" y="248" width="592" height="64" rx="8"/></g></svg>`,
  );

const longUserMessage = `Quiero que en la vista de documentos ocultemos las secciones que no aplican al cliente actual. Hoy la tabla muestra "Anexos", "Historial de firmas", "Observaciones internas" y "Adjuntos legales" aunque el tipo de documento no las use, y el usuario final se confunde.

Necesito que:
1. Revises cómo se arma la tabla en DocumentsTable.vue y de dónde salen las secciones.
2. Muevas la lista de secciones ocultas a un único lugar de configuración en el dominio (app.domain.js) para no repetir lógica en tres componentes.
3. Mantengas el comportamiento de expandir/colapsar filas exactamente igual.

No toques el backend, [Image #1] muestra las secciones que hablo. Cuando termines, decime en qué archivos quedó la lógica y corré los tests.`;

export const mockEvents: AgentEvent[] = [
  ev({ type: 'assistant_message', at: 0, text: '¿Qué querés aclarar?' }),
  ev({ type: 'completed', at: 95_000, durationMs: 95_000, reason: 'done' }),
  ev({ type: 'user_message', at: 4 * min, text: longUserMessage, attachments: [{ id: 'att_1', kind: 'image', name: 'navbar.png', url: MOCK_IMAGE }] }),
  ev({ type: 'status', at: 4 * min + 200, activity: 'searching' }),
  ev({ type: 'search', at: 4 * min + 800, kind: 'pattern', query: 'HIDDEN_SECTIONS', path: 'src/', matches: 3 }),
  ev({ type: 'search', at: 4 * min + 1500, kind: 'pattern', query: 'DocumentsTable', matches: 11 }),
  ev({ type: 'search', at: 4 * min + 2200, kind: 'pattern', query: 'sections\\s*=', matches: 6 }),
  ev({ type: 'search', at: 4 * min + 2900, kind: 'pattern', query: 'Anexos|Historial de firmas', matches: 4 }),
  ev({ type: 'search', at: 4 * min + 3300, kind: 'pattern', query: 'expandedRows', matches: 2 }),
  ev({ type: 'search', at: 4 * min + 3800, kind: 'glob', query: 'src/**/*.vue', matches: 42 }),
  ev({ type: 'search', at: 4 * min + 4200, kind: 'glob', query: 'src/domain/**/*.js', matches: 9 }),
  ev({ type: 'search', at: 4 * min + 4600, kind: 'pattern', query: 'documentType', path: 'src/domain', matches: 14 }),
  ev({ type: 'search', at: 4 * min + 5000, kind: 'pattern', query: 'toggleSection', matches: 3 }),
  ev({ type: 'search', at: 4 * min + 5400, kind: 'pattern', query: 'Adjuntos legales', matches: 2 }),
  ev({ type: 'search', at: 4 * min + 6000, kind: 'list', query: 'src/components/documents', matches: 8 }),
  ev({ type: 'search', at: 4 * min + 6300, kind: 'list', query: 'src/domain', matches: 5 }),
  ev({ type: 'search', at: 4 * min + 6600, kind: 'list', query: 'src/composables', matches: 12 }),
  ev({ type: 'search', at: 4 * min + 6900, kind: 'list', query: 'tests/unit/documents', matches: 4 }),
  ev({ type: 'file_read', at: 4 * min + 7500, path: 'src/domain/app.domain.js', lines: 312 }),
  ev({ type: 'file_read', at: 4 * min + 8200, path: 'src/components/documents/DocumentsTable.vue', lines: 488 }),
  ev({ type: 'file_read', at: 4 * min + 8900, path: 'src/components/documents/DocumentRow.vue', lines: 140 }),
  ev({ type: 'shell_command', at: 4 * min + 9500, command: 'git status --short', status: 'success', exitCode: 0, durationMs: 180, output: ' M src/components/documents/DocumentsTable.vue\n?? notes.md' }),
  ev({ type: 'shell_command', at: 4 * min + 10_000, command: 'git log --oneline -n 8 -- src/components/documents/DocumentsTable.vue', status: 'success', exitCode: 0, durationMs: 210, output: 'a41f2c9 fix: sticky header offset\n3b8e771 feat: documents table filters\n9c02d1e refactor: extract DocumentRow\n1e7a0f4 chore: eslint\n' }),
  ev({ type: 'shell_command', at: 4 * min + 10_500, command: 'node -e "console.log(require(\'./package.json\').scripts)"', status: 'success', exitCode: 0, durationMs: 320, output: "{ dev: 'vite', build: 'vite build', test: 'vitest run', lint: 'eslint .' }" }),
  ev({ type: 'shell_command', at: 4 * min + 11_000, command: 'npx vitest run tests/unit/documents --reporter=dot', status: 'success', exitCode: 0, durationMs: 4200, output: '····················\n\n Test Files  4 passed (4)\n      Tests  20 passed (20)\n   Duration  3.91s' }),
  ev({ type: 'shell_command', at: 4 * min + 16_000, command: 'grep -rn "sections" src/components/documents | wc -l', status: 'success', exitCode: 0, durationMs: 90, output: '27' }),
  ev({ type: 'shell_command', at: 4 * min + 16_500, command: 'cat src/domain/app.domain.js | sed -n 170,210p', status: 'success', exitCode: 0, durationMs: 60, output: 'export const DOCUMENT_TYPES = {\n  contract: { label: "Contrato", sections: ["anexos", "firmas", "observaciones", "legales"] },\n  invoice:  { label: "Factura",  sections: ["anexos"] },\n  memo:     { label: "Memo",     sections: [] },\n}' }),
  ev({ type: 'assistant_message', at: 5 * min, text: 'Ya tengo el mapa. Aplico los cambios.' }),
  ev({ type: 'status', at: 5 * min + 100, activity: 'editing' }),
  ev({
    type: 'file_write',
    at: 5 * min + 2000,
    path: 'src/domain/app.domain.js',
    kind: 'M',
    additions: 23,
    deletions: 4,
    before: `export const DOCUMENT_TYPES = {
  contract: { label: "Contrato", sections: ["anexos", "firmas", "observaciones", "legales"] },
  invoice:  { label: "Factura",  sections: ["anexos"] },
  memo:     { label: "Memo",     sections: [] },
}

export function sectionsFor(type) {
  return DOCUMENT_TYPES[type]?.sections ?? []
}`,
    after: `export const DOCUMENT_TYPES = {
  contract: { label: "Contrato", sections: ["anexos", "firmas", "observaciones", "legales"] },
  invoice:  { label: "Factura",  sections: ["anexos"] },
  memo:     { label: "Memo",     sections: [] },
}

/**
 * Sections that must never be rendered for the current tenant, regardless of
 * document type. Single source of truth — DocumentsTable, DocumentRow and the
 * export dialog all read from here.
 */
export const HIDDEN_SECTIONS = new Set([
  "anexos",
  "firmas",
  "observaciones",
  "legales",
])

export function isSectionVisible(id) {
  return !HIDDEN_SECTIONS.has(id)
}

export function sectionsFor(type) {
  const all = DOCUMENT_TYPES[type]?.sections ?? []
  return all.filter(isSectionVisible)
}

export function visibleSectionCount(type) {
  return sectionsFor(type).length
}`,
  }),
  ev({
    type: 'file_write',
    at: 5 * min + 4000,
    path: 'src/components/documents/DocumentsTable.vue',
    kind: 'M',
    additions: 6,
    deletions: 11,
    before: `const sections = computed(() => props.document.sections.filter(s => !localHidden.value.includes(s)))
const localHidden = ref(["observaciones", "legales"])`,
    after: `import { sectionsFor } from "@/domain/app.domain"
const sections = computed(() => sectionsFor(props.document.type))`,
  }),
  ev({
    type: 'file_write',
    at: 5 * min + 5500,
    path: 'src/components/documents/DocumentRow.vue',
    kind: 'M',
    additions: 2,
    deletions: 3,
    before: `const showSection = (id) => !["firmas"].includes(id)`,
    after: `import { isSectionVisible } from "@/domain/app.domain"
const showSection = isSectionVisible`,
  }),
  ev({ type: 'search', at: 5 * min + 7000, kind: 'pattern', query: 'localHidden', matches: 0 }),
  ev({ type: 'shell_command', at: 5 * min + 7500, command: 'npx eslint src/domain src/components/documents', status: 'success', exitCode: 0, durationMs: 2100, output: '' }),
  ev({ type: 'shell_command', at: 5 * min + 10_000, command: 'npx vitest run tests/unit/documents --reporter=dot', status: 'success', exitCode: 0, durationMs: 4000, output: '····················\n\n Test Files  4 passed (4)\n      Tests  20 passed (20)\n   Duration  3.72s' },
  ),
  ev({ type: 'shell_command', at: 5 * min + 14_500, command: 'git diff --stat', status: 'success', exitCode: 0, durationMs: 120, output: ' src/components/documents/DocumentRow.vue    |  5 +-\n src/components/documents/DocumentsTable.vue | 17 +--\n src/domain/app.domain.js                     | 27 +++-\n 3 files changed, 31 insertions(+), 18 deletions(-)' }),
  ev({
    type: 'assistant_message',
    at: 5 * min + 16_000,
    text: `Listo. Las cuatro ya no se ven: \`app.domain.js:186\` tiene la lista \`HIDDEN_SECTIONS\` y \`sectionsFor()\` la aplica antes de devolver secciones, así que \`DocumentsTable.vue\` y \`DocumentRow.vue\` dejaron de filtrar por su cuenta.

Cambios:

- **\`src/domain/app.domain.js\`** — nueva constante \`HIDDEN_SECTIONS\`, helper \`isSectionVisible()\` y \`sectionsFor()\` ahora filtra. Única fuente de verdad.
- **\`DocumentsTable.vue\`** — eliminado \`localHidden\`; la computed \`sections\` usa \`sectionsFor(props.document.type)\`.
- **\`DocumentRow.vue\`** — \`showSection\` delega en \`isSectionVisible\`.

Expandir/colapsar no cambió: \`expandedRows\` y \`toggleSection\` quedaron intactos. Lint limpio y los 20 tests de \`tests/unit/documents\` pasan.`,
  }),
  ev({ type: 'completed', at: 5 * min + 17_000, durationMs: 77_000, reason: 'done' }),
];

export const mockRunningEvents: AgentEvent[] = [
  { id: 'evr_1', sessionId: 'ses_melon_docs', timestamp: now - 3 * min, type: 'user_message', text: 'Virtualizá DocumentsTable.vue con @tanstack/vue-virtual y mantené los filtros de columna. Medí antes y después con 5k filas.' },
  { id: 'evr_2', sessionId: 'ses_melon_docs', timestamp: now - 3 * min + 500, type: 'status', activity: 'reading' },
  { id: 'evr_3', sessionId: 'ses_melon_docs', timestamp: now - 3 * min + 900, type: 'file_read', path: 'src/components/documents/DocumentsTable.vue', lines: 488 },
  { id: 'evr_4', sessionId: 'ses_melon_docs', timestamp: now - 3 * min + 2000, type: 'search', kind: 'pattern', query: 'v-for="row in rows"', matches: 1 },
  { id: 'evr_5', sessionId: 'ses_melon_docs', timestamp: now - 2 * min, type: 'assistant_message', text: 'La tabla renderiza todas las filas de una vez y el header sticky depende del scroll del contenedor. Voy a envolver el `<tbody>` en un virtualizer y a mover el offset del header a una CSS variable.' },
  { id: 'evr_6', sessionId: 'ses_melon_docs', timestamp: now - 90_000, type: 'file_write', path: 'src/components/documents/DocumentsTable.vue', kind: 'M', additions: 41, deletions: 12 },
  { id: 'evr_7', sessionId: 'ses_melon_docs', timestamp: now - 40_000, type: 'shell_command', command: 'npm run build', status: 'running' },
];

export const mockWaitingEvents: AgentEvent[] = [
  { id: 'evw_1', sessionId: 'ses_melon_deploy', timestamp: now - 9 * min, type: 'user_message', text: 'Preparame el deploy a producción: Dockerfile multi-stage, compose para staging y un script de release que limpie el build anterior.' },
  { id: 'evw_2', sessionId: 'ses_melon_deploy', timestamp: now - 8 * min, type: 'file_write', path: 'Dockerfile', kind: 'A', additions: 38, deletions: 0 },
  { id: 'evw_3', sessionId: 'ses_melon_deploy', timestamp: now - 7 * min, type: 'file_write', path: 'docker-compose.staging.yml', kind: 'A', additions: 24, deletions: 0 },
  { id: 'evw_4', sessionId: 'ses_melon_deploy', timestamp: now - 6 * min, type: 'assistant_message', text: 'Antes de escribir el script de release necesito limpiar el directorio `build/` para que el paso de copia no arrastre artefactos viejos.' },
  { id: 'evw_5', sessionId: 'ses_melon_deploy', timestamp: now - 5 * min, type: 'permission_request', toolName: 'Bash', summary: 'Claude wants to run a shell command', detail: 'rm -rf build/' },
];
