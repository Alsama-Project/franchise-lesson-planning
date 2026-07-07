// Ported colour values for the Coordinator Review · Annotation Layer design. Kept
// in one place so the palette is auditable against the export and the JSX reads
// cleanly. Where a value equals an existing design token (teal #1F7A6C / deep teal
// #186155) the token's value is reused rather than a new hex invented.

export const A = {
  // pane chrome
  pane: '#F3F7F5',
  paneBorder: '#DCE6E2',
  headBorder: '#E1EAE6',
  title: '#15433C',
  countFg: '#186155',
  countBg: '#E2EFEB',
  countBorder: '#CFE2DC',

  // tabs / filters
  tabActiveBg: '#FFFFFF',
  tabActiveFg: '#15433C',
  tabIdleFg: '#6E8B84',
  tabBorder: '#D3E0DB',

  // cards
  cardBorder: '#E4EBE8',
  cardText: '#3A332E',
  cardTime: '#A79E94',

  // kind tags
  suggestionFg: '#17685B',
  suggestionBg: '#DCEBE6',
  commentFg: '#8A6D2E',
  commentBg: '#F3EAD8',

  // decided chips
  acceptedFg: '#186155',
  acceptedBg: '#E2EFEB',
  rejectedFg: '#8A6157',
  rejectedBg: '#EFE7E2',

  // avatars
  avCoord: '#1F7A6C',
  avTeacher: '#6E8B84',

  // role badges
  badgeCoordFg: '#186155',
  badgeCoordBg: '#E2EFEB',
  badgeTeacherFg: '#6B6157',
  badgeTeacherBg: '#EFEAE2',

  // suggestion from→to
  fromFg: '#9A7B5A',
  toFg: '#17685B',
  stripBg: '#F1F7F4',
  stripBorder: '#DCE9E4',

  // affordance pills woven into the lesson
  pillTealBg: '#E7F1EE',
  pillTealBorder: '#CBE1DA',
  pillTealFg: '#17685B',
  pillGreenFg: '#2E7D5B',

  // buttons
  teal: '#1F7A6C',
  tealBorder: '#BFDAD3',
  neutralBorder: '#D7DEDB',
  neutralFg: '#5C6B66',
  amberFg: '#9A6312',
  amberBorder: '#E5C892',

  // composer / misc
  textareaBorder: '#D7E3DF',
  hint: '#8A958F',
  line: '#D3E0DB',
  emptyTitle: '#15433C',
  emptyBody: '#756B64',
  replyBorder: '#D8E4DF',

  // section ↔ card coupling (Google-Docs left border on a commented section)
  sectionOpen: '#1F7A6C', // solid teal — the section has an open card
  sectionMuted: '#BFD8D2', // muted teal — the section's card is resolved
  // resolved card chrome (greyed, reduced opacity handled inline)
  resolvedFg: '#8A958F',
} as const;
