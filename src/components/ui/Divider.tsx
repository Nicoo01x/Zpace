import { cn } from '@/lib/cn';

export function Divider({ orientation = 'horizontal', className, inset }: { orientation?: 'horizontal' | 'vertical'; className?: string; inset?: boolean }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        inset && (orientation === 'horizontal' ? 'mx-2 w-auto' : 'my-1.5 h-auto'),
        className,
      )}
    />
  );
}
