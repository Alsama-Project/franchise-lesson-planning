'use client';

// Carries the board's current coordinate (as a URL query) down to the cards and the
// creation affordances, so every link into a plan can round-trip back to the SAME
// week the user was viewing. The value is the board's live `?month=&week=&view=`
// query — reactive to the view toggle — computed once in WeeklyOverview. An empty
// string means "no coordinate" (empty board): consumers then link to the plain plan
// / overview, which lands on the current week by default.

import { createContext, useContext, type ReactNode } from 'react';

const BoardReturnContext = createContext<string>('');

export function BoardReturnProvider({
  query,
  children,
}: {
  query: string;
  children: ReactNode;
}) {
  return <BoardReturnContext.Provider value={query}>{children}</BoardReturnContext.Provider>;
}

/** The board's current coordinate as a URL query (`month=&week=&view=`); '' when none. */
export function useBoardReturnQuery(): string {
  return useContext(BoardReturnContext);
}

/** Append the board's return query to a plan path, so back-navigation restores the week. */
export function usePlanHref(): (path: string) => string {
  const query = useBoardReturnQuery();
  return (path: string) => (query ? `${path}?${query}` : path);
}
