'use client';

// The faceted "Resource bank" picker, backed by the real resource data layer.
// On open it loads the subject-scoped resources once, resolves uploader names,
// and derives every facet (Subject, Skill, File type, Shared by) plus counts
// from that set — no static/mock vocabulary. Search, the active filter chips,
// and the facets all filter client-side; results sort by usage_count ("Most
// used"); selection is single, and Add to worksheet hands the chosen resource
// back to the builder.

import { useEffect, useMemo, useState } from 'react';
import type { ResourceWithTags, TagsByDimension } from '@/types/resource';
import { searchResourcesAction, getUploaderNamesAction } from '@/lib/actions/resources';
import type { WorksheetContext } from './context';
import {
  resourceFormat,
  formatColors,
  initials,
  avatarColor,
  type ResourceFormat,
} from './resourceFormat';

const TEAL = '#1F7A6C';

function checkboxStyle(on: boolean): React.CSSProperties {
  return on
    ? { width: 16, height: 16, borderRadius: 4, background: TEAL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
    : { width: 16, height: 16, borderRadius: 4, border: '1.5px solid #CFC5B8', flexShrink: 0 };
}

function Check({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l4 4 10-11" />
    </svg>
  );
}

/** A card chip's colours by tag dimension (skill teal, theme pink, else neutral). */
function chipColors(dimension: string): { color: string; bg: string } {
  if (dimension === 'skill_type') return { color: '#186155', bg: '#E4F0ED' };
  if (dimension === 'theme') return { color: '#B62A5C', bg: '#FBEFF3' };
  return { color: '#7A6E62', bg: '#F1ECE3' };
}

export function ResourceBankModal({
  ctx,
  vocabulary,
  onClose,
  onAdd,
}: {
  ctx: WorksheetContext;
  vocabulary: TagsByDimension;
  onClose: () => void;
  /** Add the chosen resource to the worksheet. May be async (image/PDF copy). */
  onAdd: (resource: ResourceWithTags, uploaderName: string | null) => void | Promise<void>;
}) {
  const [subjectScoped, setSubjectScoped] = useState(true);
  const [all, setAll] = useState<ResourceWithTags[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  const [query, setQuery] = useState('');
  const [yearOn, setYearOn] = useState(ctx.year != null);
  const [themeOn, setThemeOn] = useState(Boolean(ctx.theme));
  const [skillSel, setSkillSel] = useState<Set<string>>(new Set());
  const [formatSel, setFormatSel] = useState<Set<ResourceFormat>>(new Set());
  const [uploaderSel, setUploaderSel] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Load (and reload when the subject scope is cleared). RLS scopes the read.
  // Previous results stay visible during a reload (no synchronous reset).
  useEffect(() => {
    let active = true;
    searchResourcesAction({
      subjectId: subjectScoped && ctx.subjectId ? ctx.subjectId : undefined,
      limit: 200,
    })
      .then(async (rows) => {
        if (!active) return;
        setAll(rows);
        const map = await getUploaderNamesAction(rows.map((r) => r.uploaded_by));
        if (active) setNames(map);
      })
      .catch(() => {
        // Surface an empty bank ("No resources match") rather than a permanent
        // loading spinner if the read fails (RLS/network).
        if (active) setAll([]);
      });
    return () => {
      active = false;
    };
  }, [subjectScoped, ctx.subjectId]);

  const themeTagIds = useMemo(() => {
    const wanted = ctx.theme.trim().toLowerCase();
    return new Set(
      (vocabulary.theme ?? []).filter((t) => t.label.trim().toLowerCase() === wanted).map((t) => t.id),
    );
  }, [vocabulary.theme, ctx.theme]);

  const hasTag = (r: ResourceWithTags, ids: Set<string>) => r.tags.some((t) => ids.has(t.id));

  // Apply every active filter to the loaded set.
  const filtered = useMemo(() => {
    if (!all) return [];
    const q = query.trim().toLowerCase();
    return all
      .filter((r) => {
        if (q && !`${r.title} ${r.description ?? ''}`.toLowerCase().includes(q)) return false;
        if (yearOn && ctx.year != null && r.year !== ctx.year) return false;
        if (themeOn && themeTagIds.size > 0 && !hasTag(r, themeTagIds)) return false;
        if (skillSel.size > 0 && !hasTag(r, skillSel)) return false;
        if (formatSel.size > 0 && !formatSel.has(resourceFormat(r))) return false;
        if (uploaderSel.size > 0 && !uploaderSel.has(r.uploaded_by)) return false;
        return true;
      })
      .sort((a, b) => b.usage_count - a.usage_count);
  }, [all, query, yearOn, themeOn, themeTagIds, skillSel, formatSel, uploaderSel, ctx.year]);

  // ── Facet option lists + counts, derived from the loaded set ───────────────
  const skillFacets = useMemo(() => {
    if (!all) return [];
    const counts = new Map<string, number>();
    for (const r of all) for (const t of r.tags) if (t.dimension === 'skill_type') counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
    return (vocabulary.skill_type ?? [])
      .filter((t) => counts.has(t.id) || skillSel.has(t.id))
      .map((t) => ({ id: t.id, label: t.label, count: counts.get(t.id) ?? 0 }));
  }, [all, vocabulary.skill_type, skillSel]);

  const typeFacets = useMemo(() => {
    if (!all) return [];
    const counts = new Map<ResourceFormat, number>();
    for (const r of all) {
      const f = resourceFormat(r);
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([format, count]) => ({ format, count }));
  }, [all]);

  const peopleFacets = useMemo(() => {
    if (!all) return [];
    const counts = new Map<string, number>();
    for (const r of all) counts.set(r.uploaded_by, (counts.get(r.uploaded_by) ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, count]) => ({ id, name: names[id] ?? 'Unknown', count }))
      .sort((a, b) => b.count - a.count);
  }, [all, names]);

  const toggle = <T,>(set: Set<T>, value: T, setter: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  const clearAll = () => {
    setQuery('');
    setYearOn(false);
    setThemeOn(false);
    setSkillSel(new Set());
    setFormatSel(new Set());
    setUploaderSel(new Set());
  };

  // Only honour a selection that is still visible in the filtered grid, so
  // tightening a filter that hides the picked card disables Add rather than
  // adding an invisible resource.
  const pickedResource = filtered.find((r) => r.id === picked) ?? null;

  // Adding can involve copying/converting content (image upload, PDF render), so
  // it's awaited with a busy state; the builder closes the modal on success.
  const handleAdd = async () => {
    if (!pickedResource || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      await onAdd(pickedResource, names[pickedResource.uploaded_by] ?? null);
    } catch {
      setAddError('Could not add that resource. Try again.');
      setAdding(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(42,36,34,0.55)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 1000, maxWidth: '100%', maxHeight: '88vh', background: '#fff', borderRadius: 18, boxShadow: '0 40px 100px -30px rgba(20,12,8,0.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #EFE8DD', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Resource bank</span>
          </div>
          <div style={{ position: 'relative', flex: 1, maxWidth: 460 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }}>
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search resources…"
              style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, color: '#2A2422', background: '#FBF8F3', border: `1.5px solid ${TEAL}`, borderRadius: 11, padding: '11px 14px 11px 40px', outline: 'none' }}
            />
          </div>
          <button type="button" onClick={onClose} style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 9, background: '#F3ECE2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* active filters */}
        <div style={{ padding: '11px 22px', borderBottom: '1px solid #EFE8DD', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#A79E94' }}>Filters:</span>
          {ctx.subjectName ? (
            <FilterChip label={ctx.subjectName} tone="teal" onRemove={() => setSubjectScoped(false)} active={subjectScoped} />
          ) : null}
          {ctx.year != null && yearOn ? (
            <FilterChip label={`Year ${ctx.year}`} tone="teal" onRemove={() => setYearOn(false)} active />
          ) : null}
          {ctx.theme && themeOn ? (
            <FilterChip label={ctx.theme} tone="pink" onRemove={() => setThemeOn(false)} active />
          ) : null}
          <span onClick={clearAll} style={{ fontSize: 12, color: '#B62A5C', cursor: 'pointer', fontWeight: 500 }}>
            Clear all
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '234px 1fr', flex: 1, minHeight: 0 }}>
          {/* facet rail */}
          <div style={{ borderRight: '1px solid #EFE8DD', background: '#FBF8F3', padding: 18, overflowY: 'auto', fontSize: 13 }}>
            <FacetGroup title="Subject">
              <FacetRow on={subjectScoped} onClick={() => setSubjectScoped((s) => !s)} label={ctx.subjectName || 'All subjects'} count={all?.length} />
            </FacetGroup>

            <FacetGroup title="Skill">
              {skillFacets.length === 0 ? <Empty /> : skillFacets.map((f) => (
                <FacetRow key={f.id} on={skillSel.has(f.id)} onClick={() => toggle(skillSel, f.id, setSkillSel)} label={f.label} count={f.count} />
              ))}
            </FacetGroup>

            <FacetGroup title="File type">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {typeFacets.length === 0 ? <Empty /> : typeFacets.map(({ format, count }) => {
                  const on = formatSel.has(format);
                  return (
                    <span
                      key={format}
                      onClick={() => toggle(formatSel, format, setFormatSel)}
                      style={on
                        ? { fontSize: 11, fontWeight: 600, color: '#fff', background: TEAL, borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }
                        : { fontSize: 11, fontWeight: 500, color: '#5C544E', background: '#fff', border: '1px solid #DDD4C8', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}
                    >
                      {format} {count}
                    </span>
                  );
                })}
              </div>
            </FacetGroup>

            <FacetGroup title="Shared by" last>
              {peopleFacets.length === 0 ? <Empty /> : peopleFacets.map((p) => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: 'pointer' }} onClick={() => toggle(uploaderSel, p.id, setUploaderSel)}>
                  <span style={checkboxStyle(uploaderSel.has(p.id))}>{uploaderSel.has(p.id) ? <Check /> : null}</span>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: avatarColor(p.name), color: '#fff', fontSize: 9, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{initials(p.name)}</span>
                  <span style={{ color: '#5C544E' }}>{p.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#A79E94' }}>{p.count}</span>
                </label>
              ))}
            </FacetGroup>
          </div>

          {/* results */}
          <div style={{ padding: '18px 20px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: '#756B64' }}>
                <b style={{ color: '#2A2422' }}>{all === null ? '…' : `${filtered.length} resources`}</b> match
              </div>
              <div style={{ fontSize: 12.5, color: '#8A8178', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Sort: <span style={{ fontWeight: 600, color: '#3A332E' }}>Most used</span>
              </div>
            </div>

            {all === null ? (
              <div style={{ fontSize: 13, color: '#8A8178', padding: '40px 0', textAlign: 'center' }}>Loading the bank…</div>
            ) : filtered.length === 0 ? (
              <div style={{ fontSize: 13, color: '#8A8178', padding: '40px 0', textAlign: 'center' }}>No resources match these filters.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {filtered.map((r) => {
                  const format = resourceFormat(r);
                  const fc = formatColors(format);
                  const isPicked = picked === r.id;
                  const chips = r.tags.filter((t) => t.dimension === 'skill_type' || t.dimension === 'theme').slice(0, 2);
                  const by = names[r.uploaded_by] ?? 'Unknown';
                  return (
                    <div
                      key={r.id}
                      onClick={() => setPicked(r.id)}
                      style={{ border: '1px solid #E7DECF', borderRadius: 13, overflow: 'hidden', cursor: 'pointer', boxShadow: isPicked ? `0 0 0 2px ${TEAL}` : 'none' }}
                    >
                      <div style={{ height: 84, background: fc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: fc.color }}>{format}</span>
                        {isPicked ? (
                          <span style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: '50%', background: TEAL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={13} />
                          </span>
                        ) : null}
                      </div>
                      <div style={{ padding: '11px 12px' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3 }}>{r.title}</div>
                        <div style={{ display: 'flex', gap: 5, margin: '8px 0', flexWrap: 'wrap' }}>
                          {chips.map((c) => {
                            const cc = chipColors(c.dimension);
                            return (
                              <span key={c.id} style={{ fontSize: 10, fontWeight: 600, color: cc.color, background: cc.bg, borderRadius: 5, padding: '2px 6px' }}>{c.label}</span>
                            );
                          })}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 20, height: 20, borderRadius: '50%', background: avatarColor(by), color: '#fff', fontSize: 8, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{initials(by)}</span>
                          <span style={{ fontSize: 11, color: '#8A8178' }}>{by}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid #EFE8DD', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12.5, color: addError ? '#B62A5C' : '#756B64' }}>
            {addError
              ? addError
              : adding
                ? 'Adding to the worksheet…'
                : pickedResource
                  ? '1 resource selected'
                  : 'Select a resource'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} disabled={adding} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#2A2422', background: '#fff', border: '1px solid #DDD4C8', padding: '10px 18px', borderRadius: 10, cursor: adding ? 'default' : 'pointer', opacity: adding ? 0.6 : 1 }}>
              Cancel
            </button>
            <button
              type="button"
              disabled={!pickedResource || adding}
              onClick={handleAdd}
              style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: TEAL, border: 'none', padding: '10px 20px', borderRadius: 10, cursor: pickedResource && !adding ? 'pointer' : 'default', opacity: pickedResource && !adding ? 1 : 0.6 }}
            >
              {adding ? 'Adding…' : 'Add to worksheet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, tone, onRemove, active }: { label: string; tone: 'teal' | 'pink'; onRemove: () => void; active: boolean }) {
  const teal = tone === 'teal';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: teal ? '#186155' : '#B62A5C', background: teal ? '#E4F0ED' : '#FBEFF3', borderRadius: 999, padding: '4px 11px', opacity: active ? 1 : 0.5 }}>
      {label}
      <span onClick={onRemove} style={{ cursor: 'pointer', color: teal ? '#8FBDB4' : '#D2A6B5' }}>✕</span>
    </span>
  );
}

function FacetGroup({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 18 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#A79E94', marginBottom: 9 }}>{title}</div>
      {children}
    </div>
  );
}

function FacetRow({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: 'pointer' }} onClick={onClick}>
      <span style={checkboxStyle(on)}>{on ? <Check /> : null}</span>
      <span style={{ color: on ? '#2A2422' : '#5C544E', fontWeight: on ? 500 : 400 }}>{label}</span>
      {count != null ? <span style={{ marginLeft: 'auto', fontSize: 11, color: '#A79E94' }}>{count}</span> : null}
    </label>
  );
}

function Empty() {
  return <div style={{ fontSize: 12, color: '#BCB3A8' }}>None</div>;
}
