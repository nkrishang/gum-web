"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import type { FeedConnection, FeedLogEntry } from "@/lib/pay/feed";
import { cn } from "@/lib/utils";

const time = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hour12: false,
});

/**
 * The widget is a client of the public Gum API like any other. This strip says so: whether the
 * long-poll is live, and, opened, every request it made and every event it received, with how
 * long each event took to reach this screen after Gum recorded it.
 */
export function LiveConsole({
  connection,
  log,
  simulated,
}: {
  connection: FeedConnection;
  log: FeedLogEntry[];
  simulated: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const listRef = React.useRef<HTMLOListElement>(null);

  React.useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open, log.length]);

  const status = {
    connecting: { text: "Connecting", dot: "bg-(--pay-faint)" },
    live: { text: simulated ? "Live · simulated API" : "Live from the Gum API", dot: "bg-(--pay-ok)" },
    reconnecting: { text: "Reconnecting…", dot: "bg-(--pay-warn)" },
    closed: { text: simulated ? "Final · simulated API" : "Final state from the Gum API", dot: "bg-(--pay-faint)" },
  }[connection];

  return (
    <div className="border-t border-(--pay-line)">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left text-[12px] text-(--pay-muted) transition-colors hover:text-(--pay-ink)"
      >
        <span className="relative flex size-2">
          {connection === "live" ? <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", status.dot)} /> : null}
          <span className={cn("relative size-2 rounded-full", status.dot)} />
        </span>
        <span className="flex-1" role="status">
          {status.text}
        </span>
        <span className="font-mono text-[11px] text-(--pay-faint)">{log.length} msgs</span>
        <ChevronDownIcon className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <ol
          ref={listRef}
          className="max-h-56 overflow-y-auto border-t border-(--pay-line) bg-(--pay-soft) px-5 py-2.5 font-mono text-[11px] leading-[1.55]"
        >
          {log.length === 0 ? <li className="text-(--pay-faint)">Nothing yet.</li> : null}
          {log.map((entry) => (
            <li key={entry.id} className="flex gap-2">
              <span className="shrink-0 text-(--pay-faint)" suppressHydrationWarning>
                {time.format(entry.at)}
              </span>
              <span
                className={cn(
                  "shrink-0",
                  entry.kind === "event" && "text-(--pay-brand)",
                  entry.kind === "error" && "text-(--pay-danger)",
                  entry.kind === "request" && "text-(--pay-faint)",
                )}
                aria-hidden
              >
                {entry.kind === "event" ? "◆" : entry.kind === "error" ? "✕" : entry.kind === "info" ? "·" : "→"}
              </span>
              <span className="min-w-0 break-all">
                <span className={entry.kind === "event" ? "font-semibold text-(--pay-ink)" : "text-(--pay-ink)"}>{entry.text}</span>
                {entry.detail ? <span className="text-(--pay-muted)"> {entry.detail}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
