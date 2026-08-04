'use client';

// The zoom pill for the worksheet pane header: zoom out · a percentage readout that
// resets to 100% on click · zoom in. Lives in the shared GeneratingPane header so it
// governs whichever surface (cards or document) is showing. Keyboard (Ctrl-±/0) and
// pinch are wired elsewhere (GeneratingPane and ZoomPage); this is the click surface.

import { useTranslations } from 'next-intl';

export function ZoomControls({
  zoom,
  onZoomOut,
  onZoomIn,
  onReset,
}: {
  zoom: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onReset: () => void;
}) {
  const t = useTranslations('worksheetGen');
  return (
    <div className="ws-no-print inline-flex items-center gap-1 rounded-full border border-border bg-surface-subtle px-1.5 py-0.5">
      <IconButton title={t('zoom.zoomOut')} onClick={onZoomOut}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" />
        </svg>
      </IconButton>
      <button
        type="button"
        onClick={onReset}
        title={t('zoom.reset')}
        className="min-w-[38px] rounded-[6px] px-1 py-0.5 text-center text-[11px] font-semibold text-ink hover:bg-surface"
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconButton title={t('zoom.zoomIn')} onClick={onZoomIn}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </IconButton>
    </div>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex h-6 w-6 items-center justify-center rounded-[6px] text-ink hover:bg-surface"
    >
      {children}
    </button>
  );
}
