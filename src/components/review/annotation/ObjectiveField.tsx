'use client';

// The SMARTT objective on the review view (`/view`), rendered to the SAME
// representation as the wizard editor's Step 1: the fixed opening stem is a
// NON-EDITABLE scaffold shown in muted ink, and only the teacher-editable
// *remainder* is fed to ProseField.
//
// This is the fix for the doubled-lead-in bug. The objective is stored WHOLE
// (stem baked in via `composeObjective`), but the editor treats the stem as a
// scaffold OUTSIDE the value (strip on load, recompose on save). Previously
// `/view` handed the *entire* stored sentence — stem included — to ProseField,
// so a coordinator's inline edit captured the scaffold into `from_value` /
// `to_value` and, on apply, wrote a full sentence whose opener no longer matched
// the exact stem; the editor then re-prepended its own scaffold ⇒ two lead-ins.
// Here the stem lives outside ProseField and only `stripStem(value)` (the
// remainder) is editable, so the scaffold can never leak into a suggestion.

import { useTranslations } from 'next-intl';
import { stripStem } from '@/lib/editor/objective';
import { ProseField } from './ProseField';

export function ObjectiveField({
  value,
  placeholder,
}: {
  value: string | null | undefined;
  placeholder?: string;
}) {
  const t = useTranslations('wizard.objective');
  return (
    <>
      <span className="text-stem">{t('stem')} </span>
      <ProseField anchorType="objective" value={stripStem(value)} placeholder={placeholder} />
    </>
  );
}
