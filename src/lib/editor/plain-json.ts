// Re-materialise a value as plain, Object.prototype-backed objects.
//
// WHY THIS EXISTS — the ProseMirror × Server Actions boundary bug:
//
// `editor.getJSON()` (and `generateJSON`) return nodes whose `attrs` object is built by
// ProseMirror's `computeAttrs` with `Object.create(null)` — a NULL prototype — and
// `Node.toJSON()` assigns it BY REFERENCE without copying. React's Server Actions wire
// format (`processReply`) only serialises a value when `isSimpleObject` holds, which
// requires `Object.getPrototypeOf(value) === Object.prototype`. A null-prototype attrs
// object fails that check, so React emits its temporary-reference marker (`"$T"`); with
// Next.js supplying a `temporaryReferences` registry so the call does not throw, the
// SERVER receives `attrs: undefined`. `JSON.stringify` then drops the key entirely,
// turning `{ type:'image', attrs:{…} }` into `{ type:'image' }` — every image loses its
// `storagePath`, every paragraph its `exerciseId` (so the per-exercise regenerate chips,
// keyed on that id, also vanish). One bug, both symptoms.
//
// It is invisible in-process: client-side the attrs are all present, merely
// null-prototyped — which is why every in-editor harness passed and only a HAR of a
// live save (attrs serialised as the string "$T") revealed it.
//
// `JSON.parse(JSON.stringify(value))` rebuilds every object with `Object.prototype`, so
// the whole tree passes `isSimpleObject` and crosses intact. Call this on ProseMirror
// JSON (`getJSON` / `generateJSON` output) at the point it is about to cross a Server
// Action — once, here, not at each call site.

/** Deep-clone `value` so every object is backed by `Object.prototype` (see file note). */
export function toPlainJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
