<!-- Handback for Kadria: fold this into the layer-4 (tool) context doc for "smartt_checker".
     Content extracted VERBATIM from the code floor; not rewritten or merged.
     Kadria to review and sign off before this goes into the objective checker's layer-4 doc.

     What STAYED in code (contract — deliberately NOT repeated here):
       - the six letter names (Specific, Measurable, Achievable, Relevant, Time-bound, Tangible),
         which map to the required JSON schema keys and the streaming scanner keys;
       - the JSON shape, the "strong" / "needs work" status enum, "note", "improved_objective";
       - the fixed stem "By the end of this session, I will be able to". The stem is a CODE
         dependency, not pedagogy: src/lib/editor/objective.ts compares stored objectives against
         OBJECTIVE_STEM, so the prompt text and that constant must agree. It deliberately stays in
         code and is NOT handed back. -->

## Pedagogy extracted from the SMARTT checker floor

Three fragments were interleaved with the machine contract in the code floor and have been
removed from it. They are reproduced verbatim below, each with a note on where it sat, so the
pedagogy can be reworded into prose in the layer-4 doc.

### 1. The "Tangible" gloss

Sat as a parenthetical immediately after "Tangible" in the six-letter anchor sentence
("…Time-bound, and Tangible (…).").

> Alsama's distinctive final letter: relatable to students' real lives — concrete and meaningful in the students' own world, not just an abstract academic skill

### 2. The stem's pedagogical qualifier

Sat at the end of the stem sentence ("…must use the exact stem "…" followed by …."). The stem
itself stays in code; only this trailing qualifier is handed back.

> followed by an observable, student-facing action

### 3. The "note" length qualifier

Sat as a qualifier on the per-letter `note` in the JSON-contract sentence ("…a single one-line
note; …"). The contract now asks for "a note"; the length guidance is handed back.

> single one-line
