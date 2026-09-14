import { FileIcon } from '@/features/files/FileIcon';
import { basename } from '@/lib/format';
import { t } from '@/i18n';

/** Pieces a rich toast is made of: a list of touched files, deploy-style steps. */
export function FilesTouched({ files, max = 4 }: { files: Array<{ path: string; add: number; del: number }>; max?: number }) {
  if (files.length === 0) return null;
  const shown = files.slice(0, max);
  return (
    <div className="toast-files">
      {shown.map((f) => (
        <div key={f.path}>
          <FileIcon name={basename(f.path)} size={12} />
          <span className="name">{basename(f.path)}</span>
          {f.add ? <span className="add">+{f.add}</span> : null}
          {f.del ? <span className="del">−{f.del}</span> : null}
        </div>
      ))}
      {files.length > max ? <div className="more">{t('+{n} more', { n: files.length - max })}</div> : null}
    </div>
  );
}


/** Deploy-style steps: dots that light up as a git action goes through its stages. */
export function Steps({ labels, at }: { labels: string[]; at: number }) {
  return (
    <div className="toast-steps">
      {labels.map((l, i) => (
        <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span className={`dot${i < at ? ' done' : i === at ? ' on' : ''}`} />
          <span style={{ opacity: i <= at ? 0.95 : 0.5 }}>{l}</span>
        </span>
      ))}
    </div>
  );
}
