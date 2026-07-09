'use client';

// The "/" insert menu for the document editor. Type "/" at the start of an empty
// line (or anywhere) to open a filterable list: Heading, Subheading, lists, table,
// image, generated resource, page break. Built on the standard @tiptap/suggestion
// utility so the trigger/filter/keyboard plumbing is the library's, not ours — the
// only bespoke part is the small portal popup (the repo has no tippy dependency).
//
// Items that need an app-level flow (upload an image, generate with AI) call back
// into the editor component via the extension options; pure editor items run a
// chained command.

import { createRoot, type Root } from 'react-dom/client';
import { Extension, type Editor, type Range } from '@tiptap/core';
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion';
import { BRAND } from './theme';

export interface SlashOptions {
  onInsertImage: (editor: Editor) => void;
  onGenerateAI: (editor: Editor) => void;
}

interface SlashItem {
  title: string;
  hint: string;
  keywords: string;
  run: (editor: Editor, range: Range, opts: SlashOptions) => void;
}

const ITEMS: SlashItem[] = [
  {
    title: 'Heading',
    hint: 'Section title',
    keywords: 'heading h2 title section',
    run: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 2 }).run(),
  },
  {
    title: 'Subheading',
    hint: 'Smaller title',
    keywords: 'subheading h3 subtitle',
    run: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 3 }).run(),
  },
  {
    title: 'Body text',
    hint: 'Plain paragraph',
    keywords: 'body paragraph text plain',
    run: (e, r) => e.chain().focus().deleteRange(r).setNode('paragraph').run(),
  },
  {
    title: 'Bulleted list',
    hint: 'Unordered list',
    keywords: 'bullet list unordered ul',
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
  },
  {
    title: 'Numbered list',
    hint: 'Ordered list',
    keywords: 'number ordered list ol',
    run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
  },
  {
    title: 'Checklist',
    hint: 'Task list',
    keywords: 'check task todo tick',
    run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(),
  },
  {
    title: 'Table',
    hint: '3 × 3 grid',
    keywords: 'table grid rows columns',
    run: (e, r) =>
      e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: 'Image',
    hint: 'Upload a picture',
    keywords: 'image picture photo upload figure',
    run: (e, r, opts) => {
      e.chain().focus().deleteRange(r).run();
      opts.onInsertImage(e);
    },
  },
  {
    title: 'Generated resource',
    hint: 'Write with AI',
    keywords: 'ai generate resource exercise ai prompt',
    run: (e, r, opts) => {
      e.chain().focus().deleteRange(r).run();
      opts.onGenerateAI(e);
    },
  },
  {
    title: 'Page break',
    hint: 'Start a new printed page',
    keywords: 'page break new page print',
    run: (e, r) => e.chain().focus().deleteRange(r).setPageBreak().run(),
  },
];

function filterItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return ITEMS;
  return ITEMS.filter(
    (it) => it.title.toLowerCase().includes(q) || it.keywords.includes(q),
  );
}

// ── The portal popup ─────────────────────────────────────────────────────────

function Popup({
  items,
  active,
  onPick,
}: {
  items: SlashItem[];
  active: number;
  onPick: (i: number) => void;
}) {
  if (items.length === 0) {
    return (
      <div style={{ padding: '10px 12px', fontSize: 13, color: BRAND.faint }}>No matches</div>
    );
  }
  return (
    <div role="listbox" style={{ maxHeight: 320, overflowY: 'auto', padding: 6 }}>
      {items.map((it, i) => (
        <button
          key={it.title}
          type="button"
          role="option"
          aria-selected={i === active}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(i);
          }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            width: 240,
            textAlign: 'left',
            gap: 1,
            padding: '7px 10px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: i === active ? BRAND.creamSoft : 'transparent',
          }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 600, color: BRAND.ink }}>{it.title}</span>
          <span style={{ fontSize: 11.5, color: BRAND.faint }}>{it.hint}</span>
        </button>
      ))}
    </div>
  );
}

/** A tiny controller that owns the portal DOM node + React root for one open menu. */
class MenuController {
  private el: HTMLDivElement;
  private root: Root;
  items: SlashItem[] = [];
  active = 0;
  private editor: Editor;
  private range: Range;
  private opts: SlashOptions;

  constructor(props: SuggestionProps<SlashItem>, opts: SlashOptions) {
    this.editor = props.editor;
    this.range = props.range;
    this.opts = opts;
    this.el = document.createElement('div');
    this.el.className = 'ws-slash-popup';
    Object.assign(this.el.style, {
      position: 'absolute',
      zIndex: '60',
      background: '#fff',
      border: '1px solid #E7DECF',
      borderRadius: '12px',
      boxShadow: '0 12px 32px -12px rgba(40,30,20,0.35)',
    } as CSSStyleDeclaration);
    document.body.appendChild(this.el);
    this.root = createRoot(this.el);
    this.update(props);
  }

  update(props: SuggestionProps<SlashItem>) {
    this.editor = props.editor;
    this.range = props.range;
    this.items = props.items;
    if (this.active >= this.items.length) this.active = 0;
    const rect = props.clientRect?.();
    if (rect) {
      this.el.style.top = `${rect.bottom + window.scrollY + 6}px`;
      this.el.style.left = `${rect.left + window.scrollX}px`;
    }
    this.render();
  }

  private pick(i: number) {
    const item = this.items[i];
    if (item) item.run(this.editor, this.range, this.opts);
  }

  onKeyDown(props: SuggestionKeyDownProps): boolean {
    const { key } = props.event;
    if (key === 'ArrowDown') {
      this.active = (this.active + 1) % Math.max(1, this.items.length);
      this.render();
      return true;
    }
    if (key === 'ArrowUp') {
      this.active = (this.active - 1 + this.items.length) % Math.max(1, this.items.length);
      this.render();
      return true;
    }
    if (key === 'Enter') {
      this.pick(this.active);
      return true;
    }
    if (key === 'Escape') {
      this.destroy();
      return true;
    }
    return false;
  }

  private render() {
    this.root.render(<Popup items={this.items} active={this.active} onPick={(i) => this.pick(i)} />);
  }

  destroy() {
    // Defer unmount to escape React's render phase.
    const root = this.root;
    const el = this.el;
    setTimeout(() => {
      root.unmount();
      el.remove();
    }, 0);
  }
}

export const SlashCommands = Extension.create<SlashOptions>({
  name: 'slashCommands',

  addOptions() {
    return {
      onInsertImage: () => {},
      onGenerateAI: () => {},
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }) => filterItems(query),
        command: () => {
          // Item execution is handled inside the popup (it needs the app callbacks),
          // so the default command is a no-op.
        },
        render: () => {
          let controller: MenuController | null = null;
          return {
            onStart: (props) => {
              controller = new MenuController(props, options);
            },
            onUpdate: (props) => controller?.update(props),
            onKeyDown: (props) => controller?.onKeyDown(props) ?? false,
            onExit: () => {
              controller?.destroy();
              controller = null;
            },
          };
        },
      }),
    ];
  },
});
