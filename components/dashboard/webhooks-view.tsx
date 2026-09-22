"use client";

import * as React from "react";
import { CheckIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Problem } from "@/components/dashboard/api-key-view";
import { SectionHeader, SectionSkeleton } from "@/components/dashboard/shell";
import { StatusDot } from "@/components/dashboard/status-dot";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { describeError, useAccount, useRotateWebhookSecret, useUpdateWebhookUrl } from "@/lib/gum/hooks";
import type { Account } from "@/lib/gum/types";
import { validateWebhookUrl } from "@/lib/webhook-url";
import { cn } from "@/lib/utils";

/**
 * Webhooks: the endpoint Gum calls and the secret it signs with, as two rows
 * of one card in the API key's pattern. Editing and confirming happen inline
 * under the row.
 */
export function WebhooksView() {
  const account = useAccount();
  // What the endpoint row last did. Held here because the row remounts on save.
  const [endpointNotice, setEndpointNotice] = React.useState<string | null>(null);
  return (
    <section id="webhooks" aria-label="Webhooks" className="scroll-mt-6">
      <SectionHeader title="Webhooks." description="Get notified when a deposit is paid, settled or expired." />
      {account.isPending ? (
        <SectionSkeleton height={112} />
      ) : account.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load your account</AlertTitle>
          <AlertDescription>{describeError(account.error)}</AlertDescription>
        </Alert>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-border bg-card">
          {/* Keyed on the saved value so the draft resets after a save or remove. */}
          <EndpointRow
            key={account.data.webhook_url ?? ""}
            account={account.data}
            notice={endpointNotice}
            onNotice={setEndpointNotice}
          />
          <SecretRow secret={account.data.webhook_secret} />
        </div>
      )}
    </section>
  );
}

function EndpointRow({
  account,
  notice,
  onNotice,
}: {
  account: Account;
  notice: string | null;
  onNotice: (notice: string | null) => void;
}) {
  const current = account.webhook_url;
  const update = useUpdateWebhookUrl();
  const [mode, setMode] = React.useState<"idle" | "edit" | "remove">("idle");
  const editing = mode === "edit";
  const [value, setValue] = React.useState(current ?? "");
  const [touched, setTouched] = React.useState(false);
  const error = touched ? validateWebhookUrl(value) : null;
  const dirty = value.trim() !== (current ?? "");

  return (
    <div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 px-4 py-3.5 sm:flex sm:flex-wrap">
        <StatusDot tone={current ? "success" : "neutral"} />
        <span className="text-[12px] font-medium text-muted-foreground">Endpoint</span>
        <span
          className={cn(
            "col-span-2 min-w-0 sm:col-auto sm:flex-1",
            current ? "truncate font-mono text-[13.5px]" : "text-[14px] text-muted-foreground",
          )}
        >
          {current ?? "–"}
        </span>
        {mode === "idle" ? (
          <span className="col-span-2 grid grid-cols-2 gap-2 sm:col-auto sm:flex sm:items-center">
            <Button type="button" variant="outline" size="sm" className={cn(!current && "col-span-2")} onClick={() => setMode("edit")}>
              {current ? "Edit" : "Set endpoint"}
            </Button>
            {current ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setMode("remove")}
              >
                Remove
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>

      {editing ? (
        <form
          className="border-t border-border px-4 pt-4 pb-5"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (validateWebhookUrl(value)) return;
            onNotice(null);
            update.mutate(value.trim() || null, {
              onSuccess: () => onNotice(value.trim() ? "Endpoint saved." : "Endpoint removed."),
            });
          }}
        >
          <p className="mb-3 text-[12.5px] text-muted-foreground">
            The default URL for deposits created without their own <code className="font-mono text-[12px]">webhook_url</code>. Public https only. Gum POSTs JSON and expects a 2xx within 10 seconds.
          </p>
          <Input
            type="url"
            inputMode="url"
            autoFocus
            placeholder="https://api.yourapp.com/webhooks/gum"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={Boolean(error) || undefined}
            aria-label="Webhook URL"
            className="h-10 max-w-xl font-mono text-[13px]"
            spellCheck={false}
            autoComplete="off"
          />
          {error ? <p className="mt-1.5 text-[12px] text-destructive">{error}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!dirty || update.isPending}>
              {update.isPending ? <Spinner data-icon="inline-start" /> : null}
              Save endpoint
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                update.reset();
                setMode("idle");
              }}
              disabled={update.isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "remove" ? (
        <div className="border-t border-border px-4 pt-4 pb-5">
          <p className="mb-3 text-[12.5px] text-muted-foreground">
            Removes the default endpoint. Deposits created without their own <code className="font-mono text-[12px]">webhook_url</code> will no longer notify anyone. Deposits that named their own URL are unaffected.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="destructive"
              disabled={update.isPending}
              onClick={() => {
                onNotice(null);
                update.mutate(null, { onSuccess: () => onNotice("Endpoint removed.") });
              }}
            >
              {update.isPending ? <Spinner data-icon="inline-start" /> : null}
              Confirm
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                update.reset();
                setMode("idle");
              }}
              disabled={update.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {notice ? <Notice onDone={() => onNotice(null)}>{notice}</Notice> : null}
      {update.error ? <Problem>{describeError(update.error)}</Problem> : null}
    </div>
  );
}

function SecretRow({ secret }: { secret: string }) {
  const rotate = useRotateWebhookSecret();
  const [shown, setShown] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [rotated, setRotated] = React.useState(false);
  const masked = `${secret.slice(0, 6)}${"•".repeat(16)}${secret.slice(-4)}`;

  return (
    <div className="border-t border-border">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 px-4 py-3.5 sm:flex sm:flex-wrap">
        <StatusDot tone="success" />
        <span className="text-[12px] font-medium text-muted-foreground">Signing secret</span>
        <span className="col-span-2 flex min-w-0 items-center gap-1 sm:col-auto sm:flex-1">
          <span className="min-w-0 truncate font-mono text-[13.5px]">{shown ? secret : masked}</span>
          <span className="flex shrink-0 items-center gap-0.5">
            <Button type="button" variant="ghost" size="icon-sm" aria-label={shown ? "Hide secret" : "Reveal secret"} onClick={() => setShown((v) => !v)}>
              {shown ? <EyeOffIcon /> : <EyeIcon />}
            </Button>
            <CopyButton value={secret} label="Copy secret" />
          </span>
        </span>
        {!confirming ? (
          <Button type="button" variant="outline" size="sm" className="col-span-2 w-full sm:col-auto sm:w-auto" onClick={() => setConfirming(true)}>
            Rotate secret
          </Button>
        ) : null}
      </div>

      {confirming ? (
        <div className="border-t border-border px-4 pt-4 pb-5">
          <p className="mb-3 text-[12.5px] text-muted-foreground">
            Gum signs every delivery with the new secret from now on. Deliveries will fail checks that use the old secret. Rejected deliveries are retried for 24 hours, so update your verifier soon after rotating and nothing is lost.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={rotate.isPending}
              onClick={() =>
                rotate.mutate(undefined, {
                  onSuccess: () => {
                    setConfirming(false);
                    setRotated(true);
                  },
                })
              }
            >
              {rotate.isPending ? <Spinner data-icon="inline-start" /> : null}
              Confirm
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                rotate.reset();
                setConfirming(false);
              }}
              disabled={rotate.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {rotated ? (
        <Notice onDone={() => setRotated(false)}>
          <span className="font-medium">Secret rotated.</span>{" "}
          <span className="text-muted-foreground">Deliveries are now signed with the new secret. Update your verifier.</span>
        </Notice>
      ) : null}
      {rotate.error ? <Problem>{describeError(rotate.error)}</Problem> : null}
    </div>
  );
}

/** What just happened, on a green strip under the row, until it is dismissed. */
function Notice({ children, onDone }: { children: React.ReactNode; onDone: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border bg-status-settled/[0.06] px-4 py-3">
      <p className="flex items-center gap-1.5 text-[12.5px]">
        <CheckIcon className="size-4 shrink-0 text-status-settled" />
        <span>{children}</span>
      </p>
      <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
