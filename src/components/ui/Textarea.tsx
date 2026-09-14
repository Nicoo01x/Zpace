import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grow with content up to `maxRows`. */
  autoGrow?: boolean;
  minRows?: number;
  maxRows?: number;
  bare?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, autoGrow = true, minRows = 1, maxRows = 12, bare, value, onChange, ...rest },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || !autoGrow) return;
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 20;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    el.style.height = 'auto';
    const max = line * maxRows + pad;
    const min = line * minRows + pad;
    const next = Math.min(max, Math.max(min, el.scrollHeight));
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [value, autoGrow, minRows, maxRows]);

  return (
    <textarea
      ref={inner}
      rows={minRows}
      value={value}
      onChange={onChange}
      className={cn(
        'block w-full resize-none bg-transparent text-primary outline-none placeholder:text-muted',
        !bare &&
          'rounded-md px-3 py-2 shadow-[inset_0_0_0_1px_var(--border)] focus:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_var(--accent-soft)] transition-[box-shadow] duration-(--motion-fast)',
        className,
      )}
      {...rest}
    />
  );
});
