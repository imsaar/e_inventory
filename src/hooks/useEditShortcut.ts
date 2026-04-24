import { useEffect } from 'react';

/**
 * Fires `handler` when the user presses 'e' (or 'E') with no modifier
 * keys. Intended for detail-view modals where "e = edit" is the keyboard
 * convention.
 *
 * Skipped when:
 *   - Cmd / Ctrl / Alt held (avoids clashing with browser shortcuts).
 *   - Focus is on an editable element (input / textarea / select /
 *     contenteditable) — otherwise typing 'e' in any text field would
 *     pop open an edit form.
 *   - IME composition is in progress.
 *
 * Pass `enabled: false` to temporarily disable (e.g. while the detail
 * view is loading and no record is available to edit yet).
 */
export function useEditShortcut(handler: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'e' && e.key !== 'E') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.isComposing) return;

      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (active.isContentEditable) return;
      }

      e.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handler, enabled]);
}
