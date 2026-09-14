import { createContext, useContext, useState, type ComponentProps, type ReactNode } from 'react';
import { DropdownMenu as RD } from 'radix-ui';
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

export interface DropdownMenuProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children: ReactNode;
}

export function DropdownMenu({ open: controlled, onOpenChange, modal = false, children }: DropdownMenuProps) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = (v: boolean) => {
    setInner(v);
    onOpenChange?.(v);
  };
  return (
    <RD.Root open={open} onOpenChange={setOpen} modal={modal}>
      <OpenCtx.Provider value={open}>{children}</OpenCtx.Provider>
    </RD.Root>
  );
}

export const DropdownMenuTrigger = RD.Trigger;
export const DropdownMenuGroup = RD.Group;
export const DropdownMenuRadioGroup = RD.RadioGroup;

export interface DropdownMenuContentProps extends Omit<ComponentProps<typeof RD.Content>, 'asChild' | 'forceMount'> {
  className?: string;
  children: ReactNode;
}

export function DropdownMenuContent({ className, children, sideOffset = 6, align = 'start', collisionPadding = 8, ...rest }: DropdownMenuContentProps) {
  const open = useContext(OpenCtx);
  return (
    <AnimatePresence>
      {open && (
        <RD.Portal forceMount>
          <RD.Content asChild forceMount sideOffset={sideOffset} align={align} collisionPadding={collisionPadding} {...rest}>
            <motion.div
              variants={popoverVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={popoverTransition}
              style={{ transformOrigin: 'var(--radix-dropdown-menu-content-transform-origin)' }}
              className={cn(menuContentClass, className)}
            >
              {children}
            </motion.div>
          </RD.Content>
        </RD.Portal>
      )}
    </AnimatePresence>
  );
}

export interface DropdownMenuItemProps extends Omit<ComponentProps<typeof RD.Item>, 'asChild'> {
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  inset?: boolean;
}

export function DropdownMenuItem({ icon, shortcut, danger, inset, className, children, ...rest }: DropdownMenuItemProps) {
  return (
    <RD.Item className={cn(menuItemClass, danger && menuItemDangerClass, inset && 'pl-7', className)} {...rest}>
      {icon}
      <span className="truncate">{children}</span>
      {shortcut ? <Shortcut combo={shortcut} className={menuShortcutClass} /> : null}
    </RD.Item>
  );
}

export function DropdownMenuCheckboxItem({ className, children, ...rest }: Omit<ComponentProps<typeof RD.CheckboxItem>, 'asChild'>) {
  return (
    <RD.CheckboxItem className={cn(menuItemClass, 'pl-7', className)} {...rest}>
      <RD.ItemIndicator className={menuCheckClass}>
        <Check size={12} strokeWidth={2.5} />
      </RD.ItemIndicator>
      <span className="truncate">{children}</span>
    </RD.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({ className, children, hint, ...rest }: Omit<ComponentProps<typeof RD.RadioItem>, 'asChild'> & { hint?: string }) {
  return (
    <RD.RadioItem className={cn(menuItemClass, 'pl-7', className)} {...rest}>
      <RD.ItemIndicator className={menuCheckClass}>
        <Check size={12} strokeWidth={2.5} />
      </RD.ItemIndicator>
      <span className="truncate">{children}</span>
      {hint ? <span className="ml-auto pl-4 text-meta text-muted">{hint}</span> : null}
    </RD.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...rest }: ComponentProps<typeof RD.Label>) {
  return <RD.Label className={cn(menuLabelClass, className)} {...rest} />;
}

export function DropdownMenuSeparator({ className, ...rest }: ComponentProps<typeof RD.Separator>) {
  return <RD.Separator className={cn(menuSeparatorClass, className)} {...rest} />;
}

export function DropdownMenuSub({ children }: { children: ReactNode }) {
  return <RD.Sub>{children}</RD.Sub>;
}

export function DropdownMenuSubTrigger({ icon, className, children, ...rest }: Omit<ComponentProps<typeof RD.SubTrigger>, 'asChild'> & { icon?: ReactNode }) {
  return (
    <RD.SubTrigger className={cn(menuItemClass, className)} {...rest}>
      {icon}
      <span className="truncate">{children}</span>
      <ChevronRight className="ml-auto !size-[13px] text-muted" />
    </RD.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, children, ...rest }: Omit<ComponentProps<typeof RD.SubContent>, 'asChild'>) {
  return (
    <RD.Portal>
      <RD.SubContent asChild sideOffset={4} alignOffset={-4} collisionPadding={8} {...rest}>
        <motion.div
          variants={popoverVariants}
          initial="hidden"
          animate="visible"
          transition={popoverTransition}
          style={{ transformOrigin: 'var(--radix-dropdown-menu-content-transform-origin)' }}
          className={cn(menuContentClass, className)}
        >
          {children}
        </motion.div>
      </RD.SubContent>
    </RD.Portal>
  );
}
