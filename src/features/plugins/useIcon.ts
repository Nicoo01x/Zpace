import { useEffect, useState } from 'react';
import { registryBases, type PluginManifest, type RegistryEntry } from './manifest';

/**
 * A plugin's icon, wherever it is shown (a library card, an installed row,
 * the sidebar): the registry's SVG as a data URL — an <img> cannot run a
 * script — fetched once per session, with an initial as the fallback.
 */

const iconCache = new Map<string, Promise<string | null>>();

/** The plugin's SVG icon as a data URL, or null while it loads or when there is none. */
export function useIcon(entry: RegistryEntry | undefined, manifest: PluginManifest) {
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
