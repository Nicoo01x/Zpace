/** Fire a celebration (confetti from the mascot + a trick); the Celebration component listens. */
export type CelebrationKind = 'done' | 'commit' | 'push' | 'success';

export function celebrate(kind: CelebrationKind = 'success') {
  window.dispatchEvent(new CustomEvent('conduit:celebrate', { detail: { kind } }));
}

