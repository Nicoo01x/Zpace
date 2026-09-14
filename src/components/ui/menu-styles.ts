/** Shared class names for dropdown, context and command menus. */

export const menuContentClass =
  'z-[1050] min-w-[180px] max-w-[320px] overflow-hidden rounded-lg bg-surface-raised p-1 shadow-popover ' +
  'outline-none backdrop-blur-xl';

export const menuItemClass =
  'relative flex h-7 cursor-default select-none items-center gap-2 rounded-md px-2 text-ui text-primary outline-none ' +
  'transition-[background-color,color] duration-(--motion-instant) ' +
  'data-highlighted:bg-surface-hover data-highlighted:text-primary ' +
  'data-[state=open]:bg-surface-hover ' +
  'data-disabled:pointer-events-none data-disabled:opacity-40 ' +
  '[&>svg]:size-[14px] [&>svg]:shrink-0 [&>svg]:text-secondary data-highlighted:[&>svg]:text-primary';

export const menuItemDangerClass = 'text-danger data-highlighted:bg-danger-soft data-highlighted:text-danger [&>svg]:text-danger';

export const menuLabelClass = 'px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted';

export const menuSeparatorClass = 'my-1 h-px bg-border';

export const menuShortcutClass = 'ml-auto pl-4';

export const menuCheckClass = 'absolute left-2 inline-flex size-[14px] items-center justify-center';
