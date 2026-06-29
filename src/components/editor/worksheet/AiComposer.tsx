'use client';

// The "Generate with AI" composer state of a Free block (aiView = 'compose'): a
// prompt textarea and the Generate / Cancel actions. Generation itself is owned
// by the parent Free block (which calls /api/generate-resource and renders the
// result into the editor); this component is the prompt UI plus a "Generating…"
// affordance.

import { useTranslations } from 'next-intl';
import { Spinner } from '@/components/ui/Spinner';

function Sparkle({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" />
    </svg>
  );
}

export function AiComposer({
  prompt,
  onPromptChange,
  onGenerate,
  onCancel,
  generating,
  error,
}: {
  prompt: string;
  onPromptChange: (next: string) => void;
  onGenerate: () => void;
  onCancel: () => void;
  generating: boolean;
  error: string | null;
}) {
  const t = useTranslations('resources');

  return (
    <div style={{ background: '#fff', padding: '30px 48px 40px', minHeight: 372 }}>
      <div style={{ maxWidth: 590, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: '#E4F0ED', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#1F7A6C' }}>
            <Sparkle />
          </span>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{t('ai.generateTitle')}</span>
        </div>

        <div style={{ border: '1.5px solid #CFE6E0', borderRadius: 14, background: '#F7FBFA', padding: 14 }}>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            disabled={generating}
            placeholder={t('ai.promptPlaceholder')}
            dir="auto"
            style={{
              width: '100%',
              fontFamily: 'var(--font-sora), sans-serif',
              fontSize: 14.5,
              lineHeight: 1.6,
              color: '#2A2422',
              background: '#fff',
              border: '1px solid #CFE6E0',
              borderRadius: 10,
              padding: '12px 13px',
              outline: 'none',
              resize: 'vertical',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 15 }}>
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating || prompt.trim().length === 0}
              style={{
                fontFamily: 'inherit',
                fontSize: 13.5,
                fontWeight: 600,
                color: '#fff',
                background: '#1F7A6C',
                border: 'none',
                padding: '11px 20px',
                borderRadius: 10,
                cursor: generating || prompt.trim().length === 0 ? 'default' : 'pointer',
                opacity: generating || prompt.trim().length === 0 ? 0.6 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
              aria-busy={generating || undefined}
            >
              {generating ? <Spinner size={15} /> : <Sparkle size={15} />}
              {generating ? t('ai.generating') : t('ai.generate')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={generating}
              style={{
                fontFamily: 'inherit',
                fontSize: 13.5,
                fontWeight: 500,
                color: '#5C544E',
                background: 'none',
                border: 'none',
                cursor: generating ? 'default' : 'pointer',
              }}
            >
              {t('ai.cancel')}
            </button>
          </div>

          {error ? (
            <div style={{ marginTop: 12, fontSize: 12.5, color: '#B62A5C' }}>{error}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
