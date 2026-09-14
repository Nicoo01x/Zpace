import { isTauri } from '@/lib/platform';
import { toast } from '@/features/notifications/toast-store';
import { t } from '@/i18n';
import { fetchReleaseNotes, useUpdate } from './store';

/**
 * Updates through Tauri's updater: the endpoint in tauri.conf.json serves a
 * signed manifest from the GitHub release; a newer version is offered in the
 * update dialog with the release's notes, downloads on "Update now" and
 * installs on restart. "Check" is manual (About) or once at launch when the
 * setting is on. Without a reachable endpoint it says so and stops.
 */
export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
}

let checking = false;

export async function checkForUpdates(opts: { quiet?: boolean } = {}): Promise<UpdateInfo | null> {
  if (!isTauri || checking) return null;
  checking = true;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check({ timeout: 15_000 });
    if (!update) {
      if (!opts.quiet) toast.success(t('Zpace is up to date'), { description: t('Nothing newer on the update channel.'), key: 'updater' });
      return null;
    }
    const info: UpdateInfo = { version: update.version, currentVersion: update.currentVersion, body: update.body ?? undefined, date: update.date ?? undefined };
    // A version the user skipped stays quiet at launch; a manual check shows it again.
    if (opts.quiet && useUpdate.getState().skipped === update.version) return info;
    const notes = (await fetchReleaseNotes(update.version)) ?? { title: `Zpace ${update.version}`, body: update.body ?? '', date: update.date ?? undefined };
    useUpdate.getState().setOffer({
      version: update.version,
      currentVersion: update.currentVersion,
      notes,
      install: async (onProgress) => {
        let total: number | null = null;
        let done = 0;
        await update.downloadAndInstall((ev) => {
          if (ev.event === 'Started') total = ev.data.contentLength ?? null;
          else if (ev.event === 'Progress') {
            done += ev.data.chunkLength;
            onProgress(done, total);
          } else if (ev.event === 'Finished') onProgress(total ?? done, total ?? done);
        });
      },
    });
    return info;
  } catch (e) {
    if (!opts.quiet) toast.warning(t('Could not check for updates'), { description: e instanceof Error ? e.message : String(e), key: 'updater' });
    return null;
  } finally {
    checking = false;
  }
}

/** Quit and start the new build. */
export async function relaunch(): Promise<void> {
  const m = await import('@tauri-apps/plugin-process');
  await m.relaunch();
}
