import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge needs to know our custom font-size utilities (text-ui,
 * text-content, …) — otherwise it treats them as colours and drops a real
 * colour class such as `text-inverse` that appears earlier in the list.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['ui', 'content', 'meta', 'terminal'] }],
      shadow: [{ shadow: ['card', 'popover', 'window', 'toast'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
