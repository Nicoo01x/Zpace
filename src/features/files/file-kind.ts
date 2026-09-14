/** Which language / tool mark a file gets, by name or extension (simple-icons slugs). */
const BY_EXT: Record<string, string> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'react', jsx: 'react',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', pyi: 'python', rs: 'rust', go: 'go', json: 'json', jsonc: 'json', json5: 'json',
  md: 'markdown', mdx: 'markdown', html: 'html5', htm: 'html5', css: 'css', scss: 'sass', sass: 'sass',
  vue: 'vuedotjs', svelte: 'svelte', yml: 'yaml', yaml: 'yaml', sh: 'gnubash', bash: 'gnubash', zsh: 'gnubash',
  c: 'c', h: 'c', cpp: 'cplusplus', cc: 'cplusplus', cxx: 'cplusplus', hpp: 'cplusplus', hh: 'cplusplus',
  java: 'openjdk', kt: 'kotlin', kts: 'kotlin', swift: 'swift', php: 'php', rb: 'ruby', dart: 'dart',
  sqlite: 'sqlite', db: 'sqlite', sql: 'postgresql', lua: 'lua', graphql: 'graphql', gql: 'graphql', astro: 'astro', toml: 'toml',
};

const BY_NAME: Record<string, string> = {
  'package.json': 'npm', 'package-lock.json': 'npm', 'dockerfile': 'docker', 'docker-compose.yml': 'docker', 'docker-compose.yaml': 'docker',
  '.gitignore': 'git', '.gitattributes': 'git', '.gitmodules': 'git', 'eslint.config.js': 'eslint', 'eslint.config.ts': 'eslint', '.eslintrc': 'eslint',
  '.prettierrc': 'prettier', 'prettier.config.js': 'prettier', 'tailwind.config.js': 'tailwindcss', 'tailwind.config.ts': 'tailwindcss',
  'vite.config.ts': 'vite', 'vite.config.js': 'vite', 'vite.config.mjs': 'vite', 'next.config.js': 'nextdotjs', 'next.config.mjs': 'nextdotjs', 'next.config.ts': 'nextdotjs',
  'angular.json': 'angular', 'pubspec.yaml': 'flutter', 'cargo.toml': 'rust', 'cargo.lock': 'rust', 'go.mod': 'go', 'go.sum': 'go', '.nvmrc': 'nodedotjs', '.node-version': 'nodedotjs',
};

export function fileKind(name: string): { slug?: string; ext: string } {
  const lower = name.toLowerCase();
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : '';
  return { slug: BY_NAME[lower] ?? BY_EXT[ext], ext };
}

