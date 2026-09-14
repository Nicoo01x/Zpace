import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, Check, ExternalLink, Puzzle, RefreshCw, Search, Trash2, PanelRight } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { usePlugins, type InstalledPlugin } from '@/stores/plugins';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Spinner } from '@/components/ui/Spinner';
import { LivingItem, LivingList, LivingSwitch } from '@/components/ui/Living';
import { openUrl } from '@/native/system';
import { useUI } from '@/stores/ui';
import { registryBases, REGISTRY_URL, REGISTRY_REPO, avatarOf, profileOf, type PluginManifest, type RegistryEntry } from './manifest';
import { install, refreshIndex, setEnabled, uninstall, updateFor } from './registry';
import { openPane } from './runtime';

/**
 * Settings › Plugins: the community library (from the registry's index)
 * and what is installed. Every card says who made it — name, GitHub
 * avatar, a link — because that is the deal: people publish under their
 * own name, with a pull request, and the app shows it.
 */
export function PluginsSection() {
  const { index, indexError, installed, busy } = usePlugins(useShallow((s) => ({ index: s.index, indexError: s.indexError, installed: s.installed, busy: s.busy })));
  const [tab, setTab] = useState<'library' | 'installed'>('library');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(!index);
  useEffect(() => {
    void refreshIndex().finally(() => setLoading(false));
  }, []);
  const refresh = async () => {
    setLoading(true);
    await refreshIndex(true);
    setLoading(false);
  };
  const entries = useMemo(() => {
    const list = index?.plugins ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((p) => [p.name, p.description, p.author.name, p.author.github, ...(p.tags ?? [])].join(' ').toLowerCase().includes(needle));
  }, [index, q]);
  const installedList = Object.values(installed).sort((a, b) => b.installedAt - a.installedAt);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-[260px] text-[12px] leading-relaxed text-secondary">
          {t('Community plugins from {repo}. Anyone can add one with a pull request.', { repo: REGISTRY_REPO })}{' '}
          <button type="button" onClick={() => void openUrl(`${REGISTRY_URL}#readme`)} className="inline-flex items-center gap-1 text-accent hover:underline">
            {t('Publish your plugin')} <ExternalLink className="size-[11px]" />
          </button>
        </div>
        <SegmentedControl
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'library', label: `${t('Library')}${index ? ` · ${index.plugins.length}` : ''}` },
            { value: 'installed', label: `${t('Installed')}${installedList.length ? ` · ${installedList.length}` : ''}` },
          ]}
        />
      </div>

      <LivingSwitch k={tab}>
        {tab === 'library' ? (
          <>
            <div className="mb-3 flex items-center gap-2">
              <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md bg-surface-inset px-2.5 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
                <Search className="size-[13px] shrink-0 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search plugins…')} className="min-w-0 flex-1 bg-transparent text-[12.5px] text-primary outline-none placeholder:text-muted" />
              </label>
              <Button size="sm" variant="ghost" leading={<RefreshCw className={cn(loading && 'animate-spin')} />} onClick={() => void refresh()} disabled={loading}>
                {t('Refresh')}
              </Button>
            </div>
            {loading && !index ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : indexError && !index ? (
              <Empty icon={<AlertTriangle className="size-4 text-warning" />} text={t('Could not reach the registry.')} hint={indexError} />
            ) : entries.length === 0 ? (
              <Empty icon={<Puzzle className="size-4" />} text={q ? t('No plugin matches.') : t('Nothing in the registry yet — publish the first one.')} />
            ) : (
              <LivingList className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
                {entries.map((e) => (
                  <LivingItem key={e.id} still>
                    <LibraryCard entry={e} installed={installed[e.id]} busy={busy[e.id]} />
                  </LivingItem>
                ))}
              </LivingList>
            )}
          </>
        ) : installedList.length === 0 ? (
          <Empty icon={<Puzzle className="size-4" />} text={t('No plugins installed yet.')} />
        ) : (
          <LivingList className="flex flex-col gap-2">
            {installedList.map((p) => (
              <LivingItem key={p.id} still>
                <InstalledRow p={p} busy={busy[p.id]} />
              </LivingItem>
            ))}
          </LivingList>
        )}
      </LivingSwitch>
    </div>
  );
}

function Empty({ icon, text, hint }: { icon: React.ReactNode; text: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-surface-inset px-4 py-10 text-center text-[12.5px] text-muted">
      {icon}
      <div>{text}</div>
      {hint ? <div className="font-mono text-[11px] opacity-70">{hint}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const iconCache = new Map<string, Promise<string | null>>();

/** The plugin's SVG icon as a data URL (an <img> cannot run a script), or null. */
function useIcon(entry: RegistryEntry | undefined, manifest: PluginManifest) {
  const [src, setSrc] = useState<string | null>(null);
  const url = manifest.icon && entry ? `${entry.path}/${manifest.icon}` : null;
  useEffect(() => {
    if (!url) return;
    if (!iconCache.has(url)) {
      iconCache.set(
        url,
        (async () => {
          for (const base of registryBases()) {
            try {
              const r = await fetch(`${base}/${url}`);
              if (!r.ok) continue;
              const txt = await r.text();
              if (txt.includes('<svg')) return `data:image/svg+xml;utf8,${encodeURIComponent(txt)}`;
            } catch {
              /* next base */
            }
          }
          return null;
        })(),
      );
    }
    let cancelled = false;
    void iconCache.get(url)!.then((v) => !cancelled && setSrc(v));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return src;
}

function PluginIcon({ src, name, size = 40 }: { src: string | null; name: string; size?: number }) {
  return src ? (
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-[10px] object-cover shadow-[0_1px_3px_rgba(0,0,0,0.18)]" style={{ width: size, height: size }} />
  ) : (
    <span className="inline-flex shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent shadow-[0_0_0_1px_var(--border)]" style={{ width: size, height: size, fontSize: size * 0.4, fontWeight: 600 }}>
      {name.trim()[0]?.toUpperCase() ?? '?'}
    </span>
  );
}

function Author({ author }: { author: PluginManifest['author'] }) {
  return (
    <button type="button" onClick={() => void openUrl(profileOf(author.github))} title={`@${author.github}`} className="group flex w-full min-w-0 max-w-full items-center gap-1.5 text-left text-[11.5px] text-secondary transition-colors hover:text-primary">
      <img src={avatarOf(author.github, 32)} alt="" className="size-4 shrink-0 rounded-full bg-surface-inset" />
      <span className="min-w-0 shrink truncate">{t('by {author}', { author: author.name })}</span>
      <span className="min-w-0 shrink-[2] truncate text-muted group-hover:text-secondary">@{author.github}</span>
    </button>
  );
}

function Tags({ m }: { m: PluginManifest }) {
  const tags = m.tags ?? [];
  const perms = m.permissions ?? [];
  if (!tags.length && !perms.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tg) => (
        <span key={tg} className="rounded-md bg-surface-inset px-1.5 py-px text-[10.5px] font-medium uppercase tracking-[0.04em] text-muted">
          {tg}
        </span>
      ))}
      {perms.length ? <span className="min-w-0 basis-full text-[11px] leading-snug text-muted">{t('Needs: {perms}', { perms: perms.join(', ') })}</span> : null}
    </div>
  );
}

/** The plugin's pictures, from the repo: the first as a banner, the rest as dots; click opens the lightbox. */
function Screenshots({ entry }: { entry: RegistryEntry }) {
  // pictures load in an <img>, which cannot fall back — jsDelivr is the steadier host for those
  const shots = (entry.screenshots ?? []).map((sh) => `${registryBases().at(-1)}/${entry.path}/${sh}`);
  const [i, setI] = useState(0);
  const openLightbox = useUI((s) => s.openLightbox);
  if (!shots.length) return null;
  const src = shots[Math.min(i, shots.length - 1)];
  return (
    <div className="-mx-3.5 -mt-3.5 mb-1">
      <button type="button" onClick={() => openLightbox({ url: src, name: entry.name })} className="group/shot relative block w-full overflow-hidden rounded-t-lg bg-surface-inset" style={{ aspectRatio: '16 / 9' }}>
        <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-(--motion-fast) group-hover/shot:scale-[1.02]" />
        {shots.length > 1 ? (
          <span className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
            {shots.map((_, k) => (
              <span
                key={k}
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  setI(k);
                }}
                className={cn('size-1.5 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.25)] transition-colors', k === i ? 'bg-white' : 'bg-white/50 hover:bg-white/80')}
              />
            ))}
          </span>
        ) : null}
      </button>
    </div>
  );
}

function LibraryCard({ entry, installed, busy }: { entry: RegistryEntry; installed?: InstalledPlugin; busy?: 'installing' | 'removing' }) {
  const icon = useIcon(entry, entry);
  const update = installed ? updateFor(installed) : null;
  return (
    <div className="flex h-full flex-col gap-2.5 overflow-hidden rounded-lg bg-surface p-3.5 shadow-[0_0_0_1px_var(--border)] transition-shadow duration-(--motion-fast) hover:shadow-[0_0_0_1px_var(--border-strong)]">
      <Screenshots entry={entry} />
      <div className="flex items-start gap-3">
        <PluginIcon src={icon} name={entry.name} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate text-[13.5px] font-medium text-primary">{entry.name}</span>
            <span className="shrink-0 font-mono text-[10.5px] text-muted">v{entry.version}</span>
          </div>
          <Author author={entry.author} />
        </div>
      </div>
      <p className="min-w-0 break-words text-[12px] leading-relaxed text-secondary">{entry.description}</p>
      <Tags m={entry} />
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {entry.homepage ? (
          <button type="button" onClick={() => void openUrl(entry.homepage!)} className="inline-flex items-center gap-1 text-[11.5px] text-muted transition-colors hover:text-primary">
            <ExternalLink className="size-[11px]" /> {t('Website')}
          </button>
        ) : null}
        <span className="flex-1" />
        {busy ? (
          <Button size="sm" loading>
            {busy === 'installing' ? t('Installing…') : t('Removing…')}
          </Button>
        ) : update ? (
          <Button size="sm" variant="primary" leading={<ArrowDownToLine />} onClick={() => void install(update)}>
            {t('Update to {version}', { version: update.version })}
          </Button>
        ) : installed ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-success-soft px-2.5 text-[12px] font-medium text-success">
            <Check className="size-[12px]" strokeWidth={3} /> {t('Installed')}
          </span>
        ) : (
          <Button size="sm" variant="primary" leading={<ArrowDownToLine />} onClick={() => void install(entry)}>
            {t('Install')}
          </Button>
        )}
      </div>
    </div>
  );
}

function InstalledRow({ p, busy }: { p: InstalledPlugin; busy?: 'installing' | 'removing' }) {
  const entry = usePlugins((s) => s.index?.plugins.find((e) => e.id === p.id));
  const icon = useIcon(entry, p.manifest);
  const update = updateFor(p);
  const panes = p.manifest.contributes?.panes ?? [];
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg bg-surface px-3.5 py-3 shadow-[0_0_0_1px_var(--border)]', !p.enabled && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-3">
        <PluginIcon src={icon} name={p.manifest.name} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-[13px] font-medium text-primary">{p.manifest.name}</span>
            <span className="shrink-0 font-mono text-[10.5px] text-muted">v{p.version}</span>
            {update ? <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-px text-[10.5px] font-medium text-accent">{t('Update to {version}', { version: update.version })}</span> : null}
          </div>
          <Author author={p.manifest.author} />
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1">
          {panes.map((pane) => (
            <Button key={pane.id} size="sm" variant="ghost" leading={<PanelRight />} disabled={!p.enabled} onClick={() => openPane({ kind: 'plugin', pluginId: p.id, paneId: pane.id })}>
              {pane.title}
            </Button>
          ))}
          {update ? (
            <Button size="sm" variant="primary" leading={<ArrowDownToLine />} loading={busy === 'installing'} onClick={() => void install(update)}>
              {t('Update')}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" aria-label={t('Uninstall')} title={t('Uninstall')} loading={busy === 'removing'} onClick={() => void uninstall(p.id)}>
            <Trash2 className="size-[13px] text-danger" />
          </Button>
          <Switch checked={p.enabled} onCheckedChange={(v) => void setEnabled(p.id, v)} />
        </div>
      </div>
      <p className="min-w-0 break-words text-[12px] leading-relaxed text-secondary">{p.manifest.description}</p>
      <Tags m={p.manifest} />
      {p.error ? (
        <div className="flex items-start gap-2 rounded-md bg-danger-soft px-2.5 py-1.5 text-[11.5px] text-danger">
          <AlertTriangle className="mt-0.5 size-[12px] shrink-0" />
          <span className="min-w-0 break-words">{t('Failed to start: {error}', { error: p.error })}</span>
        </div>
      ) : null}
    </div>
  );
}
