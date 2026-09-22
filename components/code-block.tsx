import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

type Token = { text: string; cls?: string };

/**
 * Tiny dependency-free highlighter for the shell / JSON / JS snippets on the site.
 * Good enough for short examples; not a general-purpose tokenizer.
 */
function tokenize(line: string, lang: string): Token[] {
  const out: Token[] = [];
  const rules: Array<[RegExp, string]> =
    lang === "json"
      ? [
          [/^"[^"]*"(?=\s*:)/, "text-brand"],
          [/^"(?:[^"\\]|\\.)*"/, "text-[#c6f6d5]"],
          [/^-?\d+(?:\.\d+)?/, "text-[#fbd38d]"],
          [/^(?:true|false|null)\b/, "text-[#fbd38d]"],
          [/^\/\/.*$/, "text-white/40 italic"],
        ]
      : lang === "bash"
        ? [
            [/^#.*$/, "text-white/40 italic"],
            [/^(?:curl|npm|pnpm|node|export)\b/, "text-brand"],
            [/^-{1,2}[a-zA-Z-]+/, "text-[#fbd38d]"],
            [/^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'/, "text-[#c6f6d5]"],
            [/^https?:\/\/\S+/, "text-white underline decoration-white/30 underline-offset-2"],
          ]
        : [
            [/^\/\/.*$/, "text-white/40 italic"],
            [/^(?:const|let|await|async|function|return|if|import|from|export|new|throw|export)\b/, "text-brand"],
            [/^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'|^`(?:[^`\\]|\\.)*`/, "text-[#c6f6d5]"],
            [/^\d+/, "text-[#fbd38d]"],
          ];
  let rest = line;
  let plain = "";
  while (rest.length) {
    let matched = false;
    for (const [re, cls] of rules) {
      const m = rest.match(re);
      if (m && m[0].length) {
        if (plain) out.push({ text: plain });
        plain = "";
        out.push({ text: m[0], cls });
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      plain += rest[0];
      rest = rest.slice(1);
    }
  }
  if (plain) out.push({ text: plain });
  return out;
}

export function CodeBlock({
  code,
  lang = "bash",
  title,
  className,
  copy = true,
  compact = false,
  footer,
  style,
}: {
  code: string;
  lang?: "bash" | "json" | "js" | "text";
  title?: string;
  className?: string;
  copy?: boolean;
  compact?: boolean;
  /** A status line under the code, like the response that came back. */
  footer?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <div
      className={cn(
        "group/code relative flex min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-ink text-ink-foreground shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset]",
        className,
      )}
      style={style}
    >
      {(title || copy) && (
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/10 px-3.5">
          <span className="font-mono text-[11px] tracking-wide text-white/50 uppercase">{title}</span>
          {copy && (
            <CopyButton
              value={code}
              className="size-7 text-white/60 hover:bg-white/10 hover:text-white"
            />
          )}
        </div>
      )}
      <pre
        className={cn(
          "min-h-0 flex-1 overflow-auto px-4 py-3.5 font-mono text-[12.5px] leading-[1.65] text-white/90",
          compact && "py-2.5 text-[12px]",
        )}
      >
        <code>
          {lines.map((line, i) => (
            <span key={i} className="block min-h-[1.65em] whitespace-pre">
              {lang === "text"
                ? line
                : tokenize(line, lang).map((t, j) => (
                    <span key={j} className={t.cls}>
                      {t.text}
                    </span>
                  ))}
            </span>
          ))}
        </code>
      </pre>
      {footer && (
        <div className="flex min-h-[42px] shrink-0 items-center gap-2 border-t border-white/10 px-4 font-mono text-[12.5px]">
          {footer}
        </div>
      )}
    </div>
  );
}
