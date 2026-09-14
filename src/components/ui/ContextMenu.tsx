import { createContext, useContext, useState, type ComponentProps, type ReactNode } from 'react';
import { ContextMenu as RC } from 'radix-ui';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { popoverTransition, popoverVariants } from '@/lib/motion';
import { Shortcut } from './Shortcut';
import {
  menuCheckClass,
  menuContentClass,
  menuItemClass,
  menuItemDangerClass,
  menuLabelClass,
  menuSeparatorClass,
  menuShortcutClass,
} from './menu-styles';

const OpenCtx = createContext(false);

export function ContextMenu({ children, onOpenChange }: { children: ReactNode; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <RC.Root
      onOpenChange={(v) => {
        setOpen(v);
        onOpenChange?.(v);
      }}
      modal={false}
    >
      <OpenCtx.Provider value={open}>{children}</OpenCtx.Provider>
    </RC.Root>
  );
}

export const ContextMenuTrigger = RC.Trigger;
export const ContextMenuGroup = RC.Group;
export const ContextMenuRadioGroup = RC.RadioGroup;

export function ContextMenuContent({ className, children, ...rest }: Omit<ComponentProps<typeof RC.Content>, 'asChild' | 'forceMount'>) {
  const open = useContext(OpenCtx);
  return (
    <AnimatePresence>
      {open && (
        <RC.Portal forceMount>
          <RC.Content asChild forceMount collisionPadding={8} {...rest}>
            <motion.div
              variants={popoverVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={popoverTransition}
              style={{ transformOrigin: 'var(--radix-context-menu-content-transform-origin)' }}
              className={cn(menuContentClass, className)}
            >
              {children}
            </motion.div>
          </RC.Content>
        </RC.Portal>
      )}
    </AnimatePresence>
  );
}

export interface ContextMenuItemProps extends Omit<ComponentProps<typeof RC.Item>, 'asChild'> {
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
}

export function ContextMenuItem({ icon, shortcut, danger, className, children, ...rest }: ContextMenuItemProps) {
  return (
    <RC.Item className={cn(menuItemClass, danger && menuItemDangerClass, className)} {...rest}>
      {icon}
      <span className="truncate">{children}</span>
      {shortcut ? <Shortcut combo={shortcut} className={menuShortcutClass} /> : null}
    </RC.Item>
  );
}

export function ContextMenuCheckboxItem({ className, children, ...rest }: Omit<ComponentProps<typeof RC.CheckboxItem>, 'asChild'>) {
  return (
    <RC.CheckboxItem className={cn(menuItemClass, 'pl-7', className)} {...rest}>
      <RC.ItemIndicator className={menuCheckClass}>
        <Check size={12} strokeWidth={2.5} />
      </RC.ItemIndicator>
      <span className="truncate">{children}</span>
    </RC.CheckboxItem>
  );
}

export function ContextMenuRadioItem({ className, children, ...rest }: Omit<ComponentProps<typeof RC.RadioItem>, 'asChild'>) {
  return (
    <RC.RadioItem className={cn(menuItemClass, 'pl-7', className)} {...rest}>
      <RC.ItemIndicator className={menuCheckClass}>
        <Check size={12} strokeWidth={2.5} />
      </RC.ItemIndicator>
      <span className="truncate">{children}</span>
    </RC.RadioItem>
  );
}

export function ContextMenuLabel({ className, ...rest }: ComponentProps<typeof RC.Label>) {
  return <RC.Label className={cn(menuLabelClass, className)} {...rest} />;
}

export function ContextMenuSeparator({ className, ...rest }: ComponentProps<typeof RC.Separator>) {
  return <RC.Separator className={cn(menuSeparatorClass, className)} {...rest} />;
}

export function ContextMenuSub({ children }: { children: ReactNode }) {
  return <RC.Sub>{children}</RC.Sub>;
}

export function ContextMenuSubTrigger({ icon, className, children, ...rest }: Omit<ComponentProps<typeof RC.SubTrigger>, 'asChild'> & { icon?: ReactNode }) {
  return (
    <RC.SubTrigger className={cn(menuItemClass, className)} {...rest}>
      {icon}
      <span className="truncate">{children}</span>
      <ChevronRight className="ml-auto !size-[13px] text-muted" />
    </RC.SubTrigger>
  );
}

export function ContextMenuSubContent({ className, children, ...rest }: Omit<ComponentProps<typeof RC.SubContent>, 'asChild'>) {
  return (
    <RC.Portal>
      <RC.SubContent asChild sideOffset={4} alignOffset={-4} collisionPadding={8} {...rest}>
        <motion.div
          variants={popoverVariants}
          initial="hidden"
          animate="visible"
          transition={popoverTransition}
          style={{ transformOrigin: 'var(--radix-context-menu-content-transform-origin)' }}
          className={cn(menuContentClass, className)}
        >
          {children}
        </motion.div>
      </RC.SubContent>
    </RC.Portal>
  );
}
