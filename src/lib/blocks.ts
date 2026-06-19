import type { Block } from '@/types/lesson';

/**
 * The canonical, ordered lesson scaffold a new plan starts from. Durations and
 * phases are fixed by the Alsama lesson format; the teacher fills in the rest.
 * Each block carries an editable `minutes` seeded from its fixed
 * `duration_minutes` default (anthem/warm_up/cool_down fixed at 1).
 */
export const DEFAULT_BLOCKS: Block[] = [
  { type: 'anthem', title: 'Alsama Anthem', activity_title: '', activity_ref: null, teacher_does: '', students_do: '', resources: '', phase: 'we_do', duration_minutes: 1, minutes: 1 },
  { type: 'warm_up', title: 'Warm-up', activity_title: '', activity_ref: null, teacher_does: '', students_do: '', resources: '', phase: 'we_do', duration_minutes: 1, minutes: 1 },
  { type: 'cool_down', title: 'Cool down', activity_title: '', activity_ref: null, teacher_does: '', students_do: '', resources: '', phase: 'we_do', duration_minutes: 1, minutes: 1 },
  { type: 'check_homework', title: 'Check homework', activity_title: '', activity_ref: null, teacher_does: '', students_do: '', resources: '', phase: null, duration_minutes: 2, minutes: 2 },
  { type: 'recap', title: 'Recap', activity_title: '', activity_ref: null, teacher_does: '', students_do: '', resources: '', phase: null, duration_minutes: 5, minutes: 5 },
  { type: 'new_content', title: 'New Content / Skill', activity_title: '', activity_ref: null, teacher_does: '', students_do: '', resources: '', phase: 'i_do', duration_minutes: 10, minutes: 10 },
  { type: 'cfu', title: 'Check for Understanding', activity_title: '', activity_ref: null, teacher_does: '', students_do: '', resources: '', phase: null, duration_minutes: 5, minutes: 5 },
  { type: 'independent_practice', title: 'Independent or Group Practice', activity_title: '', activity_ref: null, teacher_does: '', students_do: '', resources: '', phase: 'you_do', duration_minutes: 20, minutes: 20 },
  { type: 'exit_ticket', title: 'Exit Ticket', activity_title: '', activity_ref: null, teacher_does: '', students_do: '', resources: '', phase: null, duration_minutes: 5, minutes: 5 },
  { type: 'homework', title: 'Homework', activity_title: '', activity_ref: null, teacher_does: '', students_do: '', resources: '', phase: null, duration_minutes: 0, minutes: 0 },
];

/**
 * The in-session target: the sum of every block EXCEPT 'homework'
 * (1+1+1+2+5+10+5+20+5 = 50). Homework is done at home (guidance: 30–60 min)
 * and is excluded from the in-session total. See "the 50-minute rule" in CLAUDE.md.
 */
export const IN_SESSION_TARGET_MINUTES = 50;

/** Sum the in-session minutes of a set of blocks (everything except 'homework'). */
export function inSessionMinutes(blocks: Block[]): number {
  return blocks
    .filter((b) => b.type !== 'homework')
    .reduce((total, b) => total + b.duration_minutes, 0);
}
