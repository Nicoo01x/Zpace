import { ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent } from '@/components/ui/ContextMenu';
import { DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/DropdownMenu';

/**
 * The menu components of one family (context or dropdown), so one JSX tree
 * serves both the ⋯ button and the right-click of a sidebar row.
 */
export interface MenuKit {
  Item: typeof ContextMenuItem;
  Sep: typeof ContextMenuSeparator;
  Sub: typeof ContextMenuSub;
  SubTrigger: typeof ContextMenuSubTrigger;
  SubContent: typeof ContextMenuSubContent;
}

export const CONTEXT_KIT: MenuKit = { Item: ContextMenuItem, Sep: ContextMenuSeparator, Sub: ContextMenuSub, SubTrigger: ContextMenuSubTrigger, SubContent: ContextMenuSubContent };
// The two families share their props; the cast only reconciles the Radix generics.
export const DROPDOWN_KIT = { Item: DropdownMenuItem, Sep: DropdownMenuSeparator, Sub: DropdownMenuSub, SubTrigger: DropdownMenuSubTrigger, SubContent: DropdownMenuSubContent } as unknown as MenuKit;
