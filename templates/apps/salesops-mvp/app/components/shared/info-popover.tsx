import { useEffect, useRef, useState } from 'react';

export interface InfoPopoverProps {
  /** Short heading of the popup — also the accessible name of the help button (usually the card title). */
  title: string;
  /** Plain-language, one- or two-sentence explanation of what the card is worth. */
  text: string;
}

/**
 * A small "?" help affordance for a card header. Click toggles a compact popup
 * explaining, in plain business language, what the card is worth and what its
 * numbers mean. Closes on a second click, on Escape, or on a click outside.
 * Purely presentational — the copy is supplied by the caller.
 */
export function InfoPopover({ title, text }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={`Qué significa: ${title}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-bold leading-none text-text-muted hover:bg-border hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        ?
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={title}
          className="absolute left-0 top-6 z-20 w-64 rounded-lg border border-border bg-surface p-3 text-left shadow-lg"
        >
          <p className="text-sm font-semibold text-text">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">{text}</p>
        </div>
      )}
    </span>
  );
}
