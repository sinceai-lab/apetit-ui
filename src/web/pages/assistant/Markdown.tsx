// Light, safe Markdown renderer for chat answers (headings, lists, tables, code, emphasis, links).
// Produces React elements only; never injects HTML.
import type { ReactNode } from "react";

type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "ul" | "ol"; items: string[]; start: number }
  | { t: "code"; lang: string; text: string }
  | { t: "table"; head: string[]; align: ("left" | "right" | "center")[]; rows: string[][] }
  | { t: "quote"; text: string }
  | { t: "hr" };

const splitRow = (l: string) =>
  l
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));
const isSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i]!;
    if (!l.trim()) {
      i++;
      continue;
    }
    const fence = l.match(/^\s*(```|~~~)\s*([\w+-]*)/);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith(fence[1]!)) buf.push(lines[i++]!);
      i++;
      out.push({ t: "code", lang: fence[2] ?? "", text: buf.join("\n") });
      continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      out.push({ t: "h", level: h[1]!.length, text: h[2]!.replace(/\s#+\s*$/, "") });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      out.push({ t: "hr" });
      i++;
      continue;
    }
    if (l.includes("|") && i + 1 < lines.length && isSep(lines[i + 1]!)) {
      const head = splitRow(l);
      const align = splitRow(lines[i + 1]!).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left") as "left" | "right" | "center");
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim()) rows.push(splitRow(lines[i++]!));
      out.push({ t: "table", head, align, rows });
      continue;
    }
    const li = l.match(/^\s*([-*+]|(\d+)[.)])\s+(.*)$/);
    if (li) {
      const ordered = !!li[2];
      const items: string[] = [];
      const start = ordered ? Number(li[2]) : 1;
      while (i < lines.length) {
        const m = lines[i]!.match(/^\s*([-*+]|(\d+)[.)])\s+(.*)$/);
        if (m && !!m[2] === ordered) {
          items.push(m[3]!);
          i++;
        } else if (lines[i]!.trim() && /^\s{2,}/.test(lines[i]!) && items.length) {
          items[items.length - 1] += " " + lines[i++]!.trim();
        } else break;
      }
      out.push({ t: ordered ? "ol" : "ul", items, start });
      continue;
    }
    if (/^\s*>/.test(l)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) buf.push(lines[i++]!.replace(/^\s*>\s?/, ""));
      out.push({ t: "quote", text: buf.join(" ") });
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,6}\s|\s*```|\s*[-*+]\s|\s*\d+[.)]\s|\s*>)/.test(lines[i]!) && !(lines[i]!.includes("|") && i + 1 < lines.length && isSep(lines[i + 1]!))) buf.push(lines[i++]!);
    if (!buf.length) buf.push(lines[i++]!);
    out.push({ t: "p", text: buf.join("\n") });
  }
  return out;
}

const safeHref = (u: string) => (/^(https?:|mailto:|#)/i.test(u) ? u : null);

/** Inline: `code`, **bold**, *em*, [link](url), bare URLs, hard line breaks. */
export function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+)|(\n)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    const s = m[0];
    if (m[1]) out.push(<code key={k} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]">{s.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k} className="font-semibold">{inline(s.slice(2, -2), k)}</strong>);
    else if (m[3]) out.push(<em key={k}>{inline(s.slice(1, -1), k)}</em>);
    else if (m[4]) {
      const [, label, url] = s.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!;
      const h = safeHref(url!);
      out.push(h ? <a key={k} href={h} target={h.startsWith("#") ? undefined : "_blank"} rel="noreferrer" className="link">{inline(label!, k)}</a> : label);
    } else if (m[5]) out.push(<a key={k} href={s} target="_blank" rel="noreferrer" className="link break-all">{s}</a>);
    else if (m[6]) out.push(<br key={k} />);
    last = m.index + s.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const H_CLS = ["", "text-lg", "text-base", "text-[15px]", "text-sm", "text-sm", "text-sm"];
const NUMERIC = /^[−+-]?[\d\s.,]+\s*(%|t|ha|t\/ha|mm|°C)?$/;

export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-2.5 text-[15px] leading-relaxed">
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.t) {
          case "h":
            return <div key={k} role="heading" aria-level={Math.min(6, b.level + 1)} className={`font-display font-bold text-heading ${H_CLS[b.level]}`}>{inline(b.text, k)}</div>;
          case "p":
            return <p key={k}>{inline(b.text, k)}</p>;
          case "ul":
            return <ul key={k} className="list-disc space-y-1 pl-5 marker:text-muted">{b.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>)}</ul>;
          case "ol":
            return <ol key={k} start={b.start} className="list-decimal space-y-1 pl-5 marker:text-muted">{b.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>)}</ol>;
          case "code":
            return <pre key={k} className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs leading-relaxed">{b.text}</pre>;
          case "quote":
            return <blockquote key={k} className="border-l-[3px] border-brand-vivid pl-3 text-muted">{inline(b.text, k)}</blockquote>;
          case "hr":
            return <hr key={k} className="border-border" />;
          case "table":
            return (
              <div key={k} className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-surface-2 font-heading text-xs text-heading">
                    <tr>{b.head.map((c, j) => <th key={j} scope="col" className="whitespace-nowrap px-2.5 py-1.5 font-medium" style={{ textAlign: b.align[j] ?? "left" }}>{inline(c, `${k}h${j}`)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, ri) => (
                      <tr key={ri} className="border-t border-border">
                        {b.head.map((_, j) => {
                          const c = r[j] ?? "";
                          const num = NUMERIC.test(c);
                          return <td key={j} className={`px-2.5 py-1.5 ${num ? "tnum" : ""}`} style={{ textAlign: b.align[j] === "left" && num ? "right" : b.align[j] ?? "left" }}>{inline(c, `${k}-${ri}-${j}`)}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
