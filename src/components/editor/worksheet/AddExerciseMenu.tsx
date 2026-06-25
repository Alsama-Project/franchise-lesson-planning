'use client';

// The "+ Add exercise" affordance and its dropdown. Two visual variants share
// the same menu: `empty` is the large teal button shown when the worksheet has
// no exercises; `another` is the smaller dashed "add another" button shown below
// the last block. The menu's two items — Choose from resource bank / Create new —
// match the mockup copy exactly. Open state is owned by the parent so only one
// menu is open at a time and an outside click can close it.

function BankIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F7A6C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B62A5C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.5 7.5" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  );
}

function Menu({
  onChooseBank,
  onCreateNew,
}: {
  onChooseBank: () => void;
  onCreateNew: () => void;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 'calc(100% + 12px)',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 280,
        background: '#fff',
        border: '1px solid #E7DECF',
        borderRadius: 12,
        boxShadow: '0 24px 60px -20px rgba(40,30,20,0.55)',
        padding: 7,
        zIndex: 20,
      }}
    >
      <button
        type="button"
        onClick={onChooseBank}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: 11,
          borderRadius: 10,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          font: 'inherit',
        }}
        className="hover:bg-surface-subtle"
      >
        <span style={{ width: 36, height: 36, borderRadius: 10, background: '#E4F0ED', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <BankIcon />
        </span>
        <span>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>Choose from resource bank</span>
          <span style={{ display: 'block', fontSize: 11.5, color: '#8A8178', marginTop: 1 }}>Search the shared bank by tag</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onCreateNew}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: 11,
          borderRadius: 10,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          font: 'inherit',
        }}
        className="hover:bg-surface-subtle"
      >
        <span style={{ width: 36, height: 36, borderRadius: 10, background: '#FBF2F5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <PenIcon />
        </span>
        <span>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>Create new</span>
          <span style={{ display: 'block', fontSize: 11.5, color: '#8A8178', marginTop: 1 }}>A blank block — write, draw, drop images</span>
        </span>
      </button>
    </div>
  );
}

export function AddExerciseMenu({
  variant,
  open,
  onToggle,
  onChooseBank,
  onCreateNew,
}: {
  variant: 'empty' | 'another';
  open: boolean;
  onToggle: () => void;
  onChooseBank: () => void;
  onCreateNew: () => void;
}) {
  const empty = variant === 'empty';
  return (
    <div
      style={{ position: 'relative', display: empty ? 'inline-block' : 'flex', justifyContent: 'center', marginTop: empty ? 0 : 4 }}
      // Stop the canvas-level "close menu" handler from immediately re-closing.
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onToggle}
        style={
          empty
            ? {
                fontFamily: 'inherit',
                fontSize: 13.5,
                fontWeight: 600,
                color: '#fff',
                background: '#1F7A6C',
                border: 'none',
                padding: '10px 18px',
                borderRadius: 10,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                boxShadow: '0 6px 16px -8px rgba(31,122,108,0.5)',
              }
            : {
                fontFamily: 'inherit',
                fontSize: 12.5,
                fontWeight: 600,
                color: '#1F7A6C',
                background: '#E4F0ED',
                border: '1px dashed #9FCEC4',
                padding: '9px 16px',
                borderRadius: 10,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
              }
        }
      >
        <svg width={empty ? 15 : 14} height={empty ? 15 : 14} viewBox="0 0 24 24" fill="none" stroke={empty ? '#fff' : '#1F7A6C'} strokeWidth={empty ? 2.2 : 2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add exercise
      </button>
      {open ? <Menu onChooseBank={onChooseBank} onCreateNew={onCreateNew} /> : null}
    </div>
  );
}
