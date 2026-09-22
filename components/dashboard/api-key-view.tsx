"use client";

import * as React from "react";
import { CheckIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { useFlowRequest } from "@/components/dashboard/actions";
import { SectionHeader, SectionSkeleton } from "@/components/dashboard/shell";
import { StatusDot } from "@/components/dashboard/status-dot";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { describeError, useAccount, useCreateApiKey, useRotateApiKey } from "@/lib/gum/hooks";
import type { ApiKeyInfo, IssuedKey } from "@/lib/gum/types";
import { formatDateFull, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The API key an account's own server calls the API with: one row in the
 * webhook secret's pattern, with when it moved and the one action that applies.
 * Confirming happens inline under the row; nothing opens a modal.
 */
export function ApiKeyView() {
  const account = useAccount();
  return (
    <section id="api-key" aria-label="API key" className="scroll-mt-6">
      <SectionHeader title="API Key." description="Create an API key to use Gum programmatically via the API." />
      {account.isPending ? (
        <SectionSkeleton height={56} />
      ) : account.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load your account</AlertTitle>
          <AlertDescription>{describeError(account.error)}</AlertDescription>
        </Alert>
      ) : (
        <ApiKeyCard info={account.data.api_key} />
      )}
    </section>
  );
}

type Stage = "idle" | "confirm";

function ApiKeyCard({ info }: { info: ApiKeyInfo | null }) {
  const create = useCreateApiKey();
  const rotate = useRotateApiKey();
  const [stage, setStage] = React.useState<Stage>("idle");
  // The full key, while this page still knows it: the API hands it over once,
  // right after issuing, and stores only a hash. Gone on reload.
  const [known, setKnown] = React.useState<string | null>(null);
  const [shown, setShown] = React.useState(false);
  const [justIssued, setJustIssued] = React.useState(false);
  const hasKey = info !== null;
  const busy = create.isPending || rotate.isPending;
  const failure = create.error ?? rotate.error;
  // "Create API key" in the deposits empty state lands here, on the confirm step.
  useFlowRequest("create-api-key", "api-key", () => setStage("confirm"));

  const cancel = () => {
    create.reset();
    rotate.reset();
    setStage("idle");
  };

  const confirm = () => {
    const onSuccess = (issued: IssuedKey) => {
      setKnown(issued.api_key);
      setShown(true);
      setJustIssued(true);
      setStage("idle");
    };
    if (hasKey) rotate.mutate(undefined, { onSuccess });
    else create.mutate(undefined, { onSuccess });
  };

  const display = known
    ? shown
      ? known
      : `${known.slice(0, 12)}${"•".repeat(16)}${known.slice(-4)}`
    : hasKey
      ? `${info.prefix}${"•".repeat(16)}`
      : "–";

  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 px-4 py-3.5 sm:flex sm:flex-wrap">
        <StatusDot tone={hasKey ? "success" : "neutral"} />
        <span className="text-[12px] font-medium text-muted-foreground">API key</span>
        {/* The value and its controls travel together: a full line on a phone, inline from sm. */}
        <span className="col-span-2 flex min-w-0 items-center gap-1 sm:col-auto">
          <span className={cn("min-w-0 truncate", hasKey ? "font-mono text-[13.5px]" : "text-[14px] text-muted-foreground")}>{display}</span>
          {known ? (
            <span className="flex shrink-0 items-center gap-0.5">
              <Button type="button" variant="ghost" size="icon-sm" aria-label={shown ? "Hide key" : "Reveal key"} onClick={() => setShown((v) => !v)}>
                {shown ? <EyeOffIcon /> : <EyeIcon />}
              </Button>
              <CopyButton value={known} label="Copy API key" />
            </span>
          ) : null}
        </span>
        {/* Timestamps: stacked on a phone, one dotted line from sm. */}
        {hasKey ? (
          <span className="col-span-2 flex min-w-0 flex-col gap-y-0.5 text-[12px] text-muted-foreground sm:col-auto sm:flex-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-1.5">
            <span>Created <Ago iso={info.created_at} /></span>
            {info.rotated_at ? (
              <>
                <span aria-hidden="true" className="hidden sm:inline">·</span>
                <span>Rotated <Ago iso={info.rotated_at} /></span>
              </>
            ) : null}
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <span>{info.last_used_at ? <>Last used <Ago iso={info.last_used_at} /></> : "Not used yet"}</span>
          </span>
        ) : (
          <span className="hidden sm:block sm:flex-1" />
        )}
        {stage === "idle" ? (
          <Button type="button" variant="outline" size="sm" className="col-span-2 w-full sm:col-auto sm:w-auto" onClick={() => setStage("confirm")}>
            {hasKey ? "Rotate key" : "Generate key"}
          </Button>
        ) : null}
      </div>

      {justIssued && known ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border bg-status-settled/[0.06] px-4 py-3">
          <p className="flex items-center gap-1.5 text-[12.5px]">
            <CheckIcon className="size-4 text-status-settled" />
            <span className="font-medium">{info?.rotated_at ? "Key rotated." : "Key generated."}</span>
            <span className="text-muted-foreground">Copy it now. It stays here until you leave the page and is never shown again.</span>
          </p>
          <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setJustIssued(false)}>
            Done
          </Button>
        </div>
      ) : null}

      {stage === "confirm" ? (
        <div className="border-t border-border px-4 pt-4 pb-5">
          <p className="mb-3 text-[12.5px] text-muted-foreground">
            {hasKey
              ? "Issues a new key and disables the current one immediately. Anything still using the old key gets 401 until you switch over."
              : "For security purposes, the API key will be shown here once and never again."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={confirm} disabled={busy}>
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Confirm
            </Button>
            <Button type="button" variant="ghost" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {failure ? <Problem>{describeError(failure)}</Problem> : null}
    </div>
  );
}

/** Why the last action failed, on its own strip under the row. */
export function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="border-t border-border px-4 py-3 text-[12.5px] text-destructive">
      {children}
    </p>
  );
}

/** A relative time with the exact moment on hover, as the deposits table shows dates. */
function Ago({ iso }: { iso: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="text-foreground/80" />}>{relativeTime(iso)}</TooltipTrigger>
      <TooltipContent>{formatDateFull(iso)}</TooltipContent>
    </Tooltip>
  );
}
