import { Fragment, type ReactNode } from "react";

// Small dependency-free Markdown renderer for what the AI models emit:
// **bold**, *italic* / _italic_, `code`, [links](url), # headings, - / 1. lists,
// > blockquotes, --- rules, GFM | tables |, and blank-line-separated paragraphs.
// No raw HTML.

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // order matters: links first so their [] / () aren't eaten by emphasis
  const re =
    /(\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[2] != null && m[3] != null) {
      const href = m[3];
      const safe = /^(https?:\/\/|\/)/.test(href);
      nodes.push(
        safe ? (
          <a
            key={key}
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noreferrer" : undefined}
            className="text-accent underline underline-offset-2"
          >
            {m[2]}
          </a>
        ) : (
          m[2]
        )
      );
    } else if (m[4] ?? m[5]) nodes.push(<strong key={key}>{m[4] ?? m[5]}</strong>);
    else if (m[6] ?? m[7]) nodes.push(<em key={key}>{m[6] ?? m[7]}</em>);
    else if (m[8])
      nodes.push(
        <code key={key} className="rounded bg-surface-raised px-1 py-0.5 text-[0.85em]">
          {m[8]}
        </code>
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const HR_RE = /^\s*([-*_])\1{2,}\s*$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/;

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

export function Markdown({ children, className }: { children: string; className?: string }) {
  const blocks = children.replace(/\r\n/g, "\n").split(/\n{2,}/);

  return (
    <div className={className}>
      {blocks.map((block, bi) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (HR_RE.test(trimmed)) {
          return <hr key={bi} className="my-3 border-border" />;
        }

        const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
          return (
            <p key={bi} className="mt-3 mb-1 text-sm font-semibold first:mt-0">
              {renderInline(heading[2], `h-${bi}`)}
            </p>
          );
        }

        const lines = trimmed.split("\n");

        // GFM table: header row, separator row, then body rows.
        if (lines.length >= 2 && lines[0].includes("|") && TABLE_SEP_RE.test(lines[1])) {
          const headers = splitRow(lines[0]);
          const rows = lines.slice(2).map(splitRow);
          return (
            <div key={bi} className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-left text-[0.9em]">
                <thead>
                  <tr className="border-b border-border-strong">
                    {headers.map((h, hi) => (
                      <th key={hi} className="px-2 py-1 font-semibold">
                        {renderInline(h, `th-${bi}-${hi}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((cells, ri) => (
                    <tr key={ri} className="border-b border-border last:border-0">
                      {headers.map((_, ci) => (
                        <td key={ci} className="px-2 py-1 align-top">
                          {renderInline(cells[ci] ?? "", `td-${bi}-${ri}-${ci}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (lines.every((l) => l.trim().startsWith(">"))) {
          const inner = lines.map((l) => l.replace(/^\s*>\s?/, "")).join("\n");
          return (
            <blockquote
              key={bi}
              className="my-2 border-l-2 border-border-strong pl-3 text-muted"
            >
              {inner.split("\n").map((l, li) => (
                <Fragment key={li}>
                  {li > 0 && <br />}
                  {renderInline(l, `bq-${bi}-${li}`)}
                </Fragment>
              ))}
            </blockquote>
          );
        }

        if (lines.every((l) => LIST_ITEM_RE.test(l))) {
          const ordered = /^\s*\d+[.)]\s+/.test(lines[0]);
          const items = lines.map((l) => l.match(LIST_ITEM_RE)![1]);
          const ListTag = ordered ? "ol" : "ul";
          return (
            <ListTag
              key={bi}
              className={`my-2 ${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}
            >
              {items.map((it, ii) => (
                <li key={ii}>{renderInline(it, `li-${bi}-${ii}`)}</li>
              ))}
            </ListTag>
          );
        }

        return (
          <p key={bi} className="my-2 leading-relaxed first:mt-0 last:mb-0">
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(l, `p-${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
