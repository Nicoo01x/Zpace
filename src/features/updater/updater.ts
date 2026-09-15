import { isTauri } from '@/lib/platform';
import { invoke } from '@/native/bridge';
import { flushDurable } from '@/lib/durable-storage';
import { toast } from '@/features/notifications/toast-store';
import { t } from '@/i18n';
import { fetchReleaseNotes, useUpdate } from './store';

/**
 * Updates through Tauri's updater: the endpoint in tauri.conf.json serves a
 * signed manifest from the GitHub release; a newer version is offered in the
 * update dialog with the release's notes, downloads on "Update now" and
 * installs on restart. "Check" is manual (About) or once at launch when the
 * setting is on. Without a reachable endpoint it says so and stops.
 *
 * The check and the install are our own commands (`commands/updater.rs`),
 * not the plugin's JS API: the plugin's pre-exit cleanup deadlocked on the
 * state-file store and the installer never launched.
 */
type DownloadEvent = { event: 'started'; data: { contentLength: number | null } } | { event: 'progress'; data: { chunkLength: number } } | { event: 'finished' };
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
    const update = await invoke<UpdateInfo | null>('update_check');
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
        const { Channel } = await import('@tauri-apps/api/core');
        let total: number | null = null;
        let done = 0;
        const onEvent = new Channel<DownloadEvent>();
        onEvent.onmessage = (ev) => {
          if (ev.event === 'started') total = ev.data.contentLength ?? null;
          else if (ev.event === 'progress') {
            done += ev.data.chunkLength;
            onProgress(done, total);
          } else if (ev.event === 'finished') onProgress(total ?? done, total ?? done);
        };
        // the installer restarts the app: whatever the state file has not written yet goes to disk first
        await flushDurable();
        await invoke('update_install', { onEvent });
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
