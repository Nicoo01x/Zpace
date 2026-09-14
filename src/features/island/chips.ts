import { create } from 'zustand';

/**
 * Small live readouts plugins put in the compact island — a timer's
 * countdown, the track that is playing — next to the brand, one per
 * plugin. Never persisted: a chip is only as alive as the code that set it.
 */
export interface IslandChip {
  text: string;
  /** A short mark before the text (an emoji or a single glyph). */
  icon?: string;
  title?: string;
  /** Tint for the icon/text (a CSS colour); default white. */
  color?: string;
  /** Click handler — a plugin command, opening its pane. */
  onClick?: () => void;
}

interface ChipsState {
  chips: Record<string, IslandChip>;
  set: (owner: string, chip: IslandChip | null) => void;
}

export const useIslandChips = create<ChipsState>((set) => ({
  chips: {},
  set: (owner, chip) =>
    set((s) => {
      const chips = { ...s.chips };
      if (chip) chips[owner] = chip;
      else delete chips[owner];
      return { chips };
    }),
}));
