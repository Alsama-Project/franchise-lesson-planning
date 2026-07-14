import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/**
 * Active SMARTT-objective-guide reader.
 *
 * The guide is the admin-uploaded steering text (Kadria's guidance) that forms
 * the MIDDLE of the objective checker's composed system prompt:
 *   [hardcoded role + org framing] → [this guide] → [hardcoded SMARTT FLOOR + contract]
 * It is stored as text rows in `smartt_objective_guide` (latest `created_at` =
 * active version; see migration 0020). This module is the single read path for
 * the checker.
 *
 * Read path: the check-objective endpoint runs in teachers' (non-admin)
 * requests, which must not use the service-role key. Direct SELECT on the table
 * is admin-only, so the active content is exposed via the security-definer
 * `get_active_smartt_guide()` RPC (returns only the latest content, never the
 * history). When no guide has been uploaded the RPC returns null and we fall
 * back to {@link DEFAULT_SMARTT_GUIDE} so the check never breaks.
 *
 * Faithful clone of `@/lib/ai/resource-guide` — different table/RPC, same shape.
 */

/**
 * Hardcoded fallback guide used when the `smartt_objective_guide` table is empty.
 *
 * This is the STEERING half of the checker's original hardcoded prompt: how to
 * judge each of the six SMARTT letters, and the feedback tone. It deliberately
 * overlaps with (but does not replace) the in-code SMARTT FLOOR + output contract
 * that the checker always appends after the guide; the floor stays in code so a
 * bad upload can never change the SmarttCheck shape or drop the canonical anchor.
 *
 * Net effect: with no guide uploaded, the checker receives the same role, the
 * same per-letter steering, the same letters/stem, and the same JSON contract as
 * before this guide existed — behaviour is unchanged.
 */
export const DEFAULT_SMARTT_GUIDE = `SMARTT stands for:
- S — Specific: names one clear learning target, not a vague aim.
- M — Measurable: success is observable or assessable within the lesson.
- A — Achievable: realistic for a 50-minute session and the learners.
- R — Relevant: connected to the day's outcome and the wider curriculum.
- T — Time-bound: scoped to this session (the objective opens with "By the end of this session, I will be able to…").
- T — Tangible: this is Alsama's distinctive final letter. It means the objective is RELATABLE TO STUDENTS' REAL LIVES — it connects the learning to something concrete and meaningful in the students' own world, not just an abstract academic skill.

For each of the six letters, decide a status of "strong" or "needs work" and write a single, specific one-line note (no more than one sentence). Then give one or two overall suggestions to tighten the objective, and a suggested improved rewrite.

Keep all notes and suggestions short, plain, and practical for a busy teacher. Base your judgement only on the objective and any context provided; do not invent facts about the lesson.`;

/**
 * Return the active guide's content for the checker, falling back to
 * {@link DEFAULT_SMARTT_GUIDE} when no guide has been uploaded (or the read
 * fails). Memoised per-request via React `cache()` so repeated checks in one
 * request share a single DB round-trip.
 */
export const getActiveSmarttGuide = cache(async (): Promise<string> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_active_smartt_guide');
    if (error) return DEFAULT_SMARTT_GUIDE;
    const content = typeof data === 'string' ? data.trim() : '';
    return content.length > 0 ? content : DEFAULT_SMARTT_GUIDE;
  } catch {
    return DEFAULT_SMARTT_GUIDE;
  }
});
