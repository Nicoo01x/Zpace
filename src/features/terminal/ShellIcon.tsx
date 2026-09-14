import { Terminal, SquareTerminal, Box } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Small glyph per shell family. Text-only marks for PowerShell / WSL so nothing looks like a logo. */
export function ShellIcon({ shellId, className }: { shellId: string; className?: string }) {
  const id = shellId.toLowerCase();
  if (id.startsWith('wsl')) return <Box className={cn('size-[14px]', className)} />;
  if (id.includes('pwsh') || id.includes('powershell')) return <SquareTerminal className={cn('size-[14px]', className)} />;
  return <Terminal className={cn('size-[14px]', className)} />;
}
