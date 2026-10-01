# Worksheet template markers

A subject's worksheet template is the **`worksheet_builder` document for that subject**
(AI-instructions board, markdown). When a teacher presses **Generate** on the Review step, the
app fills that template with the lesson plan. These markers tell it where things go.

Anything that isn't a marker is ordinary markdown (headings `#`/`##`/`###`, paragraphs, lists)
and prints exactly as written.

## 1. Hints and stub lines — `hint: `

```
hint: A short activity that recaps prior knowledge.
```

A line that **starts with `hint: `** becomes an empty box carrying that text as a *hint*:
teachers see it greyed-out while editing, it is **never printed and never saved as text**.
Use it for guidance **and** for stub lines such as `hint: Write the task instructions here.`
(Do **not** write stubs as plain text — plain text prints.)

When the plan has content for a section, that content **replaces the hint/stub lines directly
above its `{{block:…}}` token**. If the section is empty, the hint stays (for teachers only).

## 2. Section slots — `{{block:<step>}}`

Put one token **alone on its own line** where a plan step's content should go:

| Token | Plan step | Notes |
|---|---|---|
| `{{block:recap}}` | Recap | Recap free text is the body, unlabelled |
| `{{block:new_content}}` | New content | |
| `{{block:check_understanding}}` | Check for understanding | |
| `{{block:independent_practice}}` | Practice 5a | AI exercises go here too |
| `{{block:group_practice}}` | Practice 5b | AI exercises go here too |
| `{{block:exit_ticket}}` | Exit ticket | |
| `{{block:homework}}` | Homework | |

At each token, in this order:

1. **Format line** — `Format: <activity title>` (from the step's activity title)
2. *(Recap only)* the Recap text, unlabelled
3. **Teacher:** + what the teacher wrote under "teacher does" — verbatim
4. **You:** + what the teacher wrote under "students do" — verbatim
5. Any **AI-generated exercises** for that step, as one block

A line is left out if its field is empty. Not shown on the worksheet: techniques, resources,
attached resource ids, and the Anthem / Warm-up / Cool-down routines. The words
"Format:", "Teacher:", "You:" follow the **subject's content language** (English/Arabic).

**Don't type a `Format:` line in the template** — the token adds it.
Every heading in the template always prints, even when its section is empty.

If a template has **no** `{{block:…}}` tokens it works exactly as before (exercises are placed
under the heading they were planned for, the teacher's plan text is not added).
Use each token **once**; a repeated token is dropped.

## 3. Page fields — `{{subject}}`, `{{theme}}`

Replace literal placeholders like `[Department Name]` and `Lesson Title`:

| Token | Fills with |
|---|---|
| `{{subject}}` | The subject name (e.g. Professionalism) |
| `{{theme}}` | The curriculum lesson title / theme |
| `{{year}}` `{{centre}}` `{{objective}}` `{{lesson_key}}` | Class year, centre name, objective (without the "By the end of this session, I will be able to" stem), lesson code |

These also work in an uploaded page frame (same names).

## Worked example — Professionalism

```markdown
# {{subject}}

## {{theme}}

## 1. Warm-up and Recap
hint: A short activity that recaps prior knowledge.
{{block:recap}}

## 2. New Content
hint: What will students learn today?
{{block:new_content}}

## 3. Check for Understanding
hint: Write the questions or checks here.
{{block:check_understanding}}

## 4. Independent Practice
hint: Write the task instructions here.
{{block:independent_practice}}

## 5. Group Practice
hint: Write the group task here.
{{block:group_practice}}

## 6. Exit Ticket
hint: Write the exit ticket question here.
{{block:exit_ticket}}

## 7. Homework
hint: Write the homework task here.
{{block:homework}}
```

Apply it through the admin AI-instructions surface (Worksheet builder → the subject's
document). Existing saved worksheets are not changed; the new template applies the next time
a teacher presses Generate / Regenerate all.
