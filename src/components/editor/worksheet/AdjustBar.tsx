'use client';

// The "Adjust" control surfaced alongside an AI-generated Free block doc — how a
// teacher iterates with AI (NOT a chat). A single instruction input plus one-tap
// adjustment chips; each adjustment is one stateless request (current doc in →
// new doc out), so there is no thread. A one-step "Undo adjust" restores the
// pre-adjustment content. Teal = tools/actions, per the project colour law.

import { useTranslations } from 'next-intl';

function Sparkle({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
    </svg>
  );
}

export function AdjustBar({
  instruction,
  onInstructionChange,
  onAdjust,
  adjusting,
  error,
  canUndo,
  onUndo,
}: {
  instruction: string;
  onInstructionChange: (next: string) => void;
  /** Apply a refinement — the typed instruction or a chip label. */
  onAdjust: (refinement: string) => void;
  adjusting: boolean;
  error: string | null;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const t = useTranslations('worksheet');
  const chips = t.raw('adjust.chips') as string[];
  const submit = () => {
    const text = instruction.trim();
    if (text) onAdjust(text);
  };

  return (
    <div
      style={{
        marginTop: 12,
        border: '1px solid #CFE6E0',
        borderRadius: 10,
        background: '#F7FBFA',
        padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
        <span style={{ color: '#1F7A6C', display: 'inline-flex' }}>
          <Sparkle />
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#186155' }}>{t('adjust.title')}</span>
        {canUndo ? (
          <button
            type="button"
            onClick={onUndo}
            disabled={adjusting}
            style={{
              marginInlineStart: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: 'inherit',
              fontSize: 11.5,
              fontWeight: 600,
              color: '#5C544E',
              background: 'none',
              border: 'none',
              cursor: adjusting ? 'default' : 'pointer',
              padding: 0,
            }}
          >
            <UndoIcon /> {t('adjust.undo')}
          </button>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onAdjust(chip)}
            disabled={adjusting}
            style={{
              fontFamily: 'inherit',
              fontSize: 11.5,
              fontWeight: 500,
              color: '#186155',
              background: '#E4F0ED',
              border: '1px solid #CFE6E0',
              borderRadius: 999,
              padding: '4px 9px',
              cursor: adjusting ? 'default' : 'pointer',
            }}
          >
            {chip}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <input
          type="text"
          value={instruction}
          onChange={(e) => onInstructionChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          disabled={adjusting}
          placeholder={t('adjust.placeholder')}
          style={{
            flex: 1,
            fontFamily: 'var(--font-sora), sans-serif',
            fontSize: 13,
            color: '#2A2422',
            background: '#fff',
            border: '1px solid #CFE6E0',
            borderRadius: 9,
            padding: '6px 10px',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={adjusting || instruction.trim().length === 0}
          style={{
            fontFamily: 'inherit',
            fontSize: 12.5,
            fontWeight: 600,
            color: '#fff',
            background: '#1F7A6C',
            border: 'none',
            borderRadius: 9,
            padding: '6px 12px',
            cursor: adjusting || instruction.trim().length === 0 ? 'default' : 'pointer',
            opacity: adjusting || instruction.trim().length === 0 ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {adjusting ? t('adjust.applying') : t('adjust.apply')}
        </button>
      </div>

      {error ? <div style={{ marginTop: 9, fontSize: 12, color: '#B62A5C' }}>{error}</div> : null}
    </div>
  );
}
