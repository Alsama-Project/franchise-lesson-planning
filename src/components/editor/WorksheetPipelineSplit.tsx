'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';

// Tailwind `lg` — the split is DESKTOP ONLY. Below this the two panes keep the
// existing stacked layout, untouched (react-resizable-panels forces the Group's
// flex-direction, so the layout can't be made responsive with CSS alone — we
// switch trees in JS instead).
const DESKTOP_QUERY = '(min-width: 1024px)';

// `matchMedia` as an external store: SSR-safe (server snapshot is always
// `false`, so hydration matches) and, unlike setState-in-an-effect, it never
// triggers a cascading render.
const subscribeDesktop = (onChange: () => void) => {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};
const getDesktopSnapshot = () => window.matchMedia(DESKTOP_QUERY).matches;
const noopSubscribe = () => () => {};
const alwaysTrue = () => true;
const alwaysFalse = () => false;

// Persist the drag ratio across reloads with the LIBRARY'S OWN mechanism
// (`useDefaultLayout` → localStorage). No custom storage logic. The Panel ids
// below are the keys this layout is stored under.
const SPLIT_ID = 'worksheet-pipeline-split';
const PANEL_IDS = ['pipeline', 'worksheet'];

/**
 * The outer two-pane container for the plan editor's working area (Steps 2–5):
 * the pipeline/step column (left) beside the persistent student worksheet
 * (right). Past `lg` the split is draggable; below `lg` the panes stack exactly
 * as before. This component only lays the two panes side by side — it never
 * reaches into either pane's contents.
 */
export function WorksheetPipelineSplit({
  pipeline,
  worksheet,
}: {
  /** Left pane: the current step's plan/pipeline content. */
  pipeline: ReactNode;
  /** Right pane: the persistent worksheet builder. */
  worksheet: ReactNode;
}) {
  // Gate on mount so the (heavy, self-fetching) worksheet mounts EXACTLY ONCE,
  // directly into its final branch — rendering the panes before we know the
  // breakpoint would mount then remount them. Server + first client render both
  // see `mounted === false` (→ neutral placeholder), so hydration matches; the
  // real branch is chosen only after hydration, when the worksheet mounts.
  const mounted = useSyncExternalStore(noopSubscribe, alwaysTrue, alwaysFalse);
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, alwaysFalse);

  // Built-in localStorage persistence for the split ratio.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: SPLIT_ID,
    panelIds: PANEL_IDS,
    storage: typeof window === 'undefined' ? undefined : localStorage,
  });

  if (!mounted) {
    return <div className="min-h-0 flex-1" />;
  }

  if (!isDesktop) {
    // Mobile: the existing stacked layout, untouched.
    return (
      <>
        {pipeline}
        {worksheet}
      </>
    );
  }

  return (
    <Group
      id={SPLIT_ID}
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="flex min-h-0 flex-1"
    >
      {/* Sizes are STRINGS → percentages (bare numbers would be pixels in this
          version). Mins keep either pane from being crushed. */}
      <Panel
        id="pipeline"
        minSize="20%"
        defaultSize="40%"
        className="flex min-h-0 min-w-0 flex-col"
        style={{ overflow: 'hidden' }}
      >
        {pipeline}
      </Panel>

      {/* Grab handle: a thin vertical bar with hover/active feedback. The 8px
          strip is the grab target; the 1px line is the visible divider. */}
      <Separator className="group relative flex w-2 shrink-0 cursor-col-resize items-stretch justify-center bg-transparent">
        <div className="w-px bg-[#EFE8DD] transition-all duration-150 group-data-[separator=hover]:w-[3px] group-data-[separator=hover]:bg-[#C9B892] group-data-[separator=active]:w-[3px] group-data-[separator=active]:bg-[#B89B6E] group-data-[separator=focus]:w-[3px] group-data-[separator=focus]:bg-[#C9B892]" />
      </Separator>

      <Panel
        id="worksheet"
        minSize="45%"
        defaultSize="60%"
        className="flex min-h-0 min-w-0 flex-col"
        style={{ overflow: 'hidden' }}
      >
        {worksheet}
      </Panel>
    </Group>
  );
}
