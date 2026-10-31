import { Fragment, type ReactNode } from 'react';

/**
 * Minimal, dependency-free markdown rendering for Mator replies.
 * Mator's text is interpreter- or LLM-generated prose using a small
 * markdown surface: paragraphs, -lists, 1. lists, # headings, **bold**,
 * *italic*, `inline code`, and ``` fenced code. Anything else renders
 * verbatim as plain text — no invented structure.
 */

let keySeed = 0;
function nextKey(prefix: string) {
  keySeed = (keySeed + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}-${keySeed}`;
}

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let match: RegExpExecArray | null;
  let last = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={nextKey('b')} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code
          key={nextKey('c')}
          className="rounded-md bg-slate-100 px-1 font-mono text-[12px] text-slate-800"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<em key={nextKey('i')}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MarkdownReply({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p
        key={nextKey('p')}
        className="text-[13px] leading-relaxed text-slate-700"
      >
        {inline(paragraph.join(' '))}
      </p>
    );
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item) => (
      <li key={nextKey('li')} className="ml-4 list-outside">
        {inline(item)}
      </li>
    ));
    blocks.push(
      list.ordered ? (
        <ol
          key={nextKey('ol')}
          className="list-decimal space-y-1 text-[13px] leading-relaxed text-slate-700"
        >
          {items}
        </ol>
      ) : (
        <ul
          key={nextKey('ul')}
          className="list-disc space-y-1 text-[13px] leading-relaxed text-slate-700"
        >
          {items}
        </ul>
      )
    );
    list = null;
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (code) {
        blocks.push(
          <pre
            key={nextKey('pre')}
            className="overflow-x-auto rounded-xl bg-slate-900 px-3 py-2.5 text-[12px] leading-5 text-slate-100"
          >
            <code className="font-mono">{code.join('\n')}</code>
          </pre>
        );
        code = null;
      } else {
        flushParagraph();
        flushList();
        code = [];
      }
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }
    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }
    if (ordered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      blocks.push(
        level === 1 ? (
          <p key={nextKey('h')} className="text-sm font-bold text-slate-900">
            {inline(heading[2])}
          </p>
        ) : (
          <p
            key={nextKey('h')}
            className={
              level === 2
                ? 'text-[13px] font-semibold text-slate-800'
                : 'text-[12px] font-semibold tracking-wide text-slate-700 uppercase'
            }
          >
            {inline(heading[2])}
          </p>
        )
      );
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  if (code !== null && code.length > 0) {
    blocks.push(
      <pre
        key={nextKey('pre2')}
        className="overflow-x-auto rounded-xl bg-slate-900 px-3 py-2.5 text-[12px] leading-5 text-slate-100"
      >
        <code className="font-mono">{code.join('\n')}</code>
      </pre>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {blocks.map((block, i) => (
        <Fragment key={i}>{block}</Fragment>
      ))}
    </div>
  );
}
