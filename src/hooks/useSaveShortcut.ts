import { useEffect } from 'react';

/**
 * Invokes `handler` on Cmd+S (Mac) or Ctrl+S (Windows/Linux). Intended for
 * edit forms — pass the same submit callback the Save button uses so the
 * keyboard shortcut behaves identically.
 *
 * The browser default "save as…" action is preempted via preventDefault.
 * IME composition sessions are ignored so the shortcut doesn't steal keys
 * mid-composition.
 */
export function useSaveShortcut(handler: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 's' && e.key !== 'S') return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey) return;
      if (e.isComposing) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handler, enabled]);
}
