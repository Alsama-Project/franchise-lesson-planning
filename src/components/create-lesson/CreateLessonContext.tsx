'use client';

// Provides the "+ Lesson" create dialog to the home tree. The hero button, the
// Calendar blank-day "+ Plan" card, and the Status "Not started" Plan chips all
// call `openCreate(seed?)` from this context to pop the same modal — pre-seeded
// with a class and/or date where relevant.

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CreateLessonDialog } from '@/components/create-lesson/CreateLessonDialog';
import type { CreateSeed, CreateSpaceGroup } from '@/components/create-lesson/types';

interface CreateLessonApi {
  /** Open the create dialog, optionally pre-seeded with a class and/or date. */
  openCreate: (seed?: CreateSeed) => void;
}

const CreateLessonContext = createContext<CreateLessonApi | null>(null);

export function useCreateLesson(): CreateLessonApi {
  const ctx = useContext(CreateLessonContext);
  if (!ctx) throw new Error('useCreateLesson must be used within CreateLessonProvider');
  return ctx;
}

export function CreateLessonProvider({
  groups,
  weekStart,
  children,
}: {
  /** Classes the user may plan for, grouped by space. */
  groups: CreateSpaceGroup[];
  /** Monday of the week the home is showing — the default calendar anchor. */
  weekStart: string;
  children: ReactNode;
}) {
  // `null` = closed; a (possibly empty) seed object = open.
  const [seed, setSeed] = useState<CreateSeed | null>(null);

  const openCreate = useCallback((next?: CreateSeed) => setSeed(next ?? {}), []);
  const close = useCallback(() => setSeed(null), []);

  return (
    <CreateLessonContext.Provider value={{ openCreate }}>
      {children}
      {seed !== null ? (
        <CreateLessonDialog
          groups={groups}
          weekStart={weekStart}
          seed={seed}
          onClose={close}
        />
      ) : null}
    </CreateLessonContext.Provider>
  );
}
