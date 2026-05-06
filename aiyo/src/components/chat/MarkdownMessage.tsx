"use client";

import type { ReactNode } from "react";

type MarkdownMessageProps = {
  content: string;
  inverted?: boolean;
};

type TextToken =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "link"; label: string; href: string };

function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function parseInline(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    const raw = match[0];
    if (raw.startsWith("`")) {
      tokens.push({ type: "code", value: raw.slice(1, -1) });
    } else if (raw.startsWith("**")) {
      tokens.push({ type: "bold", value: raw.slice(2, -2) });
    } else if (raw.startsWith("*")) {
      tokens.push({ type: "italic", value: raw.slice(1, -1) });
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(raw);
      if (linkMatch) {
        tokens.push({ type: "link", label: linkMatch[1], href: linkMatch[2] });
      } else {
        tokens.push({ type: "text", value: raw });
      }
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }

  return tokens;
}

function renderInline(text: string, keyPrefix: string, inverted: boolean): ReactNode[] {
  return parseInline(text).map((token, index) => {
    const key = `${keyPrefix}_${index}`;
    if (token.type === "code") {
      return (
        <code
          key={key}
          className={`rounded px-1 py-0.5 font-mono text-[0.85em] ${
            inverted ? "bg-white/20 text-white" : "bg-border-light text-foreground"
          }`}
        >
          {token.value}
        </code>
      );
    }
    if (token.type === "bold") {
      return <strong key={key}>{renderInline(token.value, key, inverted)}</strong>;
    }
    if (token.type === "italic") {
      return <em key={key}>{renderInline(token.value, key, inverted)}</em>;
    }
    if (token.type === "link") {
      const href = safeHref(token.href);
      if (!href) {
        return <span key={key}>{token.label}</span>;
      }
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer"
          className={inverted ? "underline decoration-white/70" : "text-primary underline"}
        >
          {token.label}
        </a>
      );
    }
    return <span key={key}>{token.value}</span>;
  });
}

function renderTextBlock(text: string, blockIndex: number, inverted: boolean): ReactNode[] {
  const nodes: ReactNode[] = [];
  const lines = text.split(/\r?\n/);
  let paragraph: string[] = [];
  let listItems: Array<{ ordered: boolean; text: string }> = [];

  function flushParagraph() {
    if (!paragraph.length) {
      return;
    }
    const value = paragraph.join(" ");
    nodes.push(
      <p key={`p_${blockIndex}_${nodes.length}`}>
        {renderInline(value, `p_${blockIndex}_${nodes.length}`, inverted)}
      </p>,
    );
    paragraph = [];
  }

  function flushList() {
    if (!listItems.length) {
      return;
    }
    const ordered = listItems[0].ordered;
    const Tag = ordered ? "ol" : "ul";
    nodes.push(
      <Tag
        key={`list_${blockIndex}_${nodes.length}`}
        className={`ml-4 ${ordered ? "list-decimal" : "list-disc"} space-y-1`}
      >
        {listItems.map((item, index) => (
          <li key={`${item.text}_${index}`}>
            {renderInline(item.text, `li_${blockIndex}_${nodes.length}_${index}`, inverted)}
          </li>
        ))}
      </Tag>,
    );
    listItems = [];
  }

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const className =
        level === 1
          ? "text-base font-semibold"
          : level === 2
            ? "text-sm font-semibold"
            : "text-sm font-medium";
      const Tag = `h${level}` as "h1" | "h2" | "h3";
      nodes.push(
        <Tag key={`h_${blockIndex}_${nodes.length}`} className={className}>
          {renderInline(heading[2], `h_${blockIndex}_${nodes.length}`, inverted)}
        </Tag>,
      );
      return;
    }

    const quote = /^>\s?(.+)$/.exec(trimmed);
    if (quote) {
      flushParagraph();
      flushList();
      nodes.push(
        <blockquote
          key={`q_${blockIndex}_${nodes.length}`}
          className={`border-l-2 pl-3 ${inverted ? "border-white/50" : "border-primary/40 text-muted"}`}
        >
          {renderInline(quote[1], `q_${blockIndex}_${nodes.length}`, inverted)}
        </blockquote>,
      );
      return;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(trimmed);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(trimmed);
    if (unordered || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (listItems.length && listItems[0].ordered !== isOrdered) {
        flushList();
      }
      listItems.push({ ordered: isOrdered, text: (unordered || ordered)?.[1] || "" });
      return;
    }

    flushList();
    paragraph.push(trimmed);
  });

  flushParagraph();
  flushList();
  return nodes;
}

export default function MarkdownMessage({ content, inverted = false }: MarkdownMessageProps) {
  const blocks = content.split(/(```[\s\S]*?```)/g).filter(Boolean);
  const renderedBlocks: ReactNode[] = [];

  blocks.forEach((block, index) => {
    if (block.startsWith("```") && block.endsWith("```")) {
      const raw = block.slice(3, -3).replace(/^\w+\r?\n/, "");
      renderedBlocks.push(
        <pre
          key={`code_${index}`}
          className={`overflow-x-auto rounded-xl p-3 text-xs ${
            inverted ? "bg-white/15 text-white" : "bg-slate-950 text-slate-50"
          }`}
        >
          <code>{raw.trim()}</code>
        </pre>,
      );
      return;
    }

    renderedBlocks.push(...renderTextBlock(block, index, inverted));
  });

  return (
    <div className="space-y-2 whitespace-normal break-words">
      {renderedBlocks}
    </div>
  );
}
