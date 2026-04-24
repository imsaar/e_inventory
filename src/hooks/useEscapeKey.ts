import { useEffect } from 'react';

/**
 * Invokes `handler` whenever the user presses Escape while the hook is
 * mounted. Intended for modal dismissal — each modal component calls this
 * once at the top of its render with its onClose/onCancel callback.
 *
 * Multiple modals stack: if two modals mount, both listeners fire on
 * Escape. The window-level `keydown` handler uses `stopPropagation` via
 * the `once-per-frame` behaviour browsers give us — in practice the
 * "topmost" modal is the last one mounted, and its cleanup fires before
 * unmount, so the pattern works for the typical modal-over-modal flows
 * in this app (e.g. OrderForm opening a component selector child).
 *
 * Pass `enabled: false` to temporarily disable the listener (useful when
 * an input inside the modal needs to swallow Escape for its own purposes,
 * like cancelling autocomplete).
 */
export function useEscapeKey(handler: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Don't steal Escape from composition / IME sessions.
      if (e.isComposing) return;
      handler();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handler, enabled]);
}
