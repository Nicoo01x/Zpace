import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { t } from '@/i18n';

/**
 * A render error in one corner must not blank the whole window. The boundary
 * shows what broke, with a retry (re-mounts the subtree) — the rest of the
 * app keeps working.
 */
interface Props {
  children: ReactNode;
  /** What is inside, for the message ("this pane", "the sidebar"). */
  label?: string;
  /** Compact card (inside a pane) or full-height. */
  compact?: boolean;
}

interface State {
  error: Error | null;
  key: number;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, key: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[conduit] render error in', this.props.label ?? 'a component', error, info.componentStack);
  }

  override render() {
    const { error, key } = this.state;
    if (!error) return <div key={key} className="contents">{this.props.children}</div>;
    return (
      <div className={this.props.compact ? 'flex h-full min-h-[120px] items-center justify-center p-6' : 'flex h-full items-center justify-center p-10'}>
        <div className="max-w-[420px] rounded-xl bg-surface-raised p-4 text-[12.5px] shadow-popover">
          <div className="mb-1.5 flex items-center gap-2 font-medium text-danger">
            <TriangleAlert className="size-4" />
            {this.props.label ? t('{label}: something went wrong', { label: this.props.label }) : t('Something went wrong')}
          </div>
          <div className="mb-3 break-words font-mono text-[11.5px] text-secondary">{error.message}</div>
          <button
            type="button"
            onClick={() => this.setState({ error: null, key: key + 1 })}
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-surface-inset px-2.5 text-[12px] font-medium text-primary transition-colors hover:bg-surface-hover"
          >
            <RotateCcw className="size-3.5" /> {t('Try again')}
          </button>
        </div>
      </div>
    );
  }
}
