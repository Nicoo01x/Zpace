import { memo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/cn';
import { openUrl } from '@/native/system';
import { t } from '@/i18n';

const components: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href) void openUrl(href);
      }}
    >
      {children}
    </a>
  ),
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  code: ({ className, children, ...rest }) => (
    <code className={cn(className)} {...rest}>
      {children}
    </code>
  ),
};

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const getText = (): string => {
    const walk = (n: React.ReactNode): string => {
      if (typeof n === 'string') return n;
      if (Array.isArray(n)) return n.map(walk).join('');
      if (n && typeof n === 'object' && 'props' in n) return walk((n as { props: { children?: React.ReactNode } }).props.children);
      return '';
    };
    return walk(children);
  };
  return (
    <div className="group/code relative">
      <pre>{children}</pre>
      <button
        type="button"
        aria-label={t('Copy code')}
        onClick={() => {
          void navigator.clipboard.writeText(getText());
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        }}
        className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-md bg-surface text-muted opacity-0 shadow-[0_0_0_1px_var(--border)] transition-opacity duration-(--motion-fast) hover:text-primary group-hover/code:opacity-100 focus-visible:opacity-100"
      >
        {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('prose-agent', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
