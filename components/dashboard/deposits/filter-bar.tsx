"use client";

import * as React from "react";
import { CalendarIcon, SearchIcon, XIcon } from "lucide-react";
import type { FilterKey } from "@/components/dashboard/deposits/deposits-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useChains } from "@/lib/gum/hooks";
import type { DepositFilters } from "@/lib/gum/types";
import { DEPOSIT_STATUSES } from "@/lib/gum/types";
import { CHAINS, STATUS_LABEL } from "@/lib/format";

const ALL = "__all__";
type TextKey = "payment_address" | "receiver" | "reference";
const TEXT_KEYS: Array<{ key: TextKey; label: string; placeholder: string }> = [
  { key: "payment_address", label: "Payment address", placeholder: "0x… payment address" },
  { key: "receiver", label: "Receiver", placeholder: "0x… receiver" },
  { key: "reference", label: "Reference", placeholder: "0x… bytes32 reference" },
];

const TEXT_ITEMS = Object.fromEntries(TEXT_KEYS.map((t) => [t.key, t.label])) as Record<TextKey, string>;

/** What each searchable field must look like; the API rejects anything else. */
function validateSearch(value: string, key: TextKey): string | null {
  const v = value.trim();
  if (!v) return null;
  if (key === "reference") {
    return /^0x[0-9a-fA-F]{64}$/.test(v) ? null : "A reference is a 0x-prefixed 32-byte hex value (66 characters).";
  }
  return /^0x[0-9a-fA-F]{40}$/.test(v) ? null : "Enter a full EVM address: 0x followed by 40 hex characters.";
}

function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Free-text search: one input, a selector for which field it targets. */
function TextSearch({
  filters,
  onChange,
}: {
  filters: DepositFilters;
  onChange: (patch: Partial<Record<FilterKey, string | undefined>>) => void;
}) {
  const active = TEXT_KEYS.find((t) => filters[t.key]) ?? TEXT_KEYS[0];
  const [textKey, setTextKey] = React.useState<TextKey>(active.key);
  const [text, setText] = React.useState(filters[active.key] ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const errorId = React.useId();

  /** Validates, then writes the filter to the URL; an invalid value is kept in the box with a message. */
  const commit = (value: string, key: TextKey) => {
    const problem = validateSearch(value, key);
    setError(problem);
    if (problem) return;
    const patch: Partial<Record<FilterKey, string | undefined>> = {
      payment_address: undefined,
      receiver: undefined,
      reference: undefined,
    };
    patch[key] = value.trim().toLowerCase() || undefined;
    onChange(patch);
  };

  return (
    <form
      className="relative flex min-w-[260px] flex-1 items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        commit(text, textKey);
      }}
    >
      <InputGroup className="flex-1" aria-invalid={error ? true : undefined}>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          onBlur={() => {
            if (text.trim() !== (filters[textKey] ?? "")) commit(text, textKey);
          }}
          placeholder={TEXT_KEYS.find((t) => t.key === textKey)?.placeholder}
          className="font-mono text-[13px]"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <InputGroupAddon align="inline-end" className="pr-0">
          <Select
            items={TEXT_ITEMS}
            value={textKey}
            onValueChange={(v) => {
              const key = v as TextKey;
              setTextKey(key);
              setError(null);
              if (text.trim()) commit(text, key);
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label="Search field"
              className="h-6 border-0 bg-transparent px-1.5 text-xs text-muted-foreground shadow-none dark:bg-transparent"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {TEXT_KEYS.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </InputGroupAddon>
      </InputGroup>
      {error && (
        <p id={errorId} role="alert" className="absolute top-full left-0 mt-0.5 text-[11px] leading-4 text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * The created-between fields. Each edit is validated as a pair before it
 * reaches the URL: "after" must fall before "before". A bad value stays in
 * its field with a message, and each picker is bounded by the other's value.
 */
function CreatedRange({
  filters,
  onChange,
}: {
  filters: DepositFilters;
  onChange: (patch: Partial<Record<FilterKey, string | undefined>>) => void;
}) {
  const [after, setAfter] = React.useState(toLocalInput(filters.created_after));
  const [before, setBefore] = React.useState(toLocalInput(filters.created_before));
  const [error, setError] = React.useState<string | null>(null);
  const errorId = React.useId();

  const apply = (nextAfter: string, nextBefore: string) => {
    const a = fromLocalInput(nextAfter);
    const b = fromLocalInput(nextBefore);
    if (a && b && a >= b) {
      setError("“After” must be earlier than “before”.");
      return;
    }
    setError(null);
    onChange({ created_after: a, created_before: b });
  };

  const count = Number(Boolean(filters.created_after)) + Number(Boolean(filters.created_before));
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="created_after" className="text-xs">After</Label>
        <Input
          id="created_after"
          type="datetime-local"
          value={after}
          max={before || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setAfter(e.target.value);
            apply(e.target.value, before);
          }}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="created_before" className="text-xs">Before</Label>
        <Input
          id="created_before"
          type="datetime-local"
          value={before}
          min={after || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setBefore(e.target.value);
            apply(after, e.target.value);
          }}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-[11px] leading-4 text-destructive">
          {error}
        </p>
      )}
      {count > 0 && (
        <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange({ created_after: undefined, created_before: undefined })}>
          Clear dates
        </Button>
      )}
    </div>
  );
}

export function DepositFilterBar({
  filters,
  onChange,
  onClear,
  hasFilters,
}: {
  filters: DepositFilters;
  onChange: (patch: Partial<Record<FilterKey, string | undefined>>) => void;
  onClear: () => void;
  hasFilters: boolean;
}) {
  const chains = useChains();
  const chainOptions = React.useMemo(() => {
    if (chains.data?.length) return chains.data.map((c) => ({ id: String(c.chain_id), name: CHAINS[c.chain_id]?.name ?? c.name, tokens: c.tokens.map((t) => t.symbol) }));
    return Object.entries(CHAINS).map(([id, c]) => ({ id, name: c.name, tokens: [] as string[] }));
  }, [chains.data]);

  const tokenOptions = React.useMemo(() => {
    const selected = chainOptions.find((c) => c.id === filters.chain_id);
    const list = selected?.tokens.length ? selected.tokens : chainOptions.flatMap((c) => c.tokens);
    const unique = Array.from(new Set(list.length ? list : ["USDC", "USDT", "AUSD"]));
    if (filters.token && !unique.includes(filters.token)) unique.push(filters.token);
    return unique;
  }, [chainOptions, filters.chain_id, filters.token]);

  const dateCount = Number(Boolean(filters.created_after)) + Number(Boolean(filters.created_before));

  // Base UI renders the raw value in SelectValue unless the root knows the item labels.
  const statusItems = React.useMemo(
    () => ({ [ALL]: "All statuses", ...Object.fromEntries(DEPOSIT_STATUSES.map((s) => [s, STATUS_LABEL[s]])) }),
    [],
  );
  const chainItems = React.useMemo(
    () => ({ [ALL]: "All chains", ...Object.fromEntries(chainOptions.map((c) => [c.id, c.name])) }),
    [chainOptions],
  );
  const tokenItems = React.useMemo(
    () => ({ [ALL]: "All tokens", ...Object.fromEntries(tokenOptions.map((t) => [t, t])) }),
    [tokenOptions],
  );

  // Phones get the table alone: five controls wrapping over three lines read
  // as clutter, and the table itself already scrolls.
  return (
    <div className="hidden flex-wrap items-center gap-2 md:flex">
      <Select
        items={statusItems}
        value={filters.status || ALL}
        onValueChange={(v) => onChange({ status: v === ALL ? undefined : (v as string) })}
      >
        <SelectTrigger aria-label="Status" className="w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {DEPOSIT_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={chainItems}
        value={filters.chain_id || ALL}
        onValueChange={(v) => onChange({ chain_id: v === ALL ? undefined : (v as string), token: undefined })}
      >
        <SelectTrigger aria-label="Chain" className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All chains</SelectItem>
          {chainOptions.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select items={tokenItems} value={filters.token || ALL} onValueChange={(v) => onChange({ token: v === ALL ? undefined : (v as string) })}>
        <SelectTrigger aria-label="Token" className="w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All tokens</SelectItem>
          {tokenOptions.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <TextSearch
        // Remount when the URL-driven value changes so local draft state resets.
        key={`${filters.payment_address ?? ""}|${filters.receiver ?? ""}|${filters.reference ?? ""}`}
        filters={filters}
        onChange={onChange}
      />

      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="default" aria-label="Created between" />}>
          <CalendarIcon data-icon="inline-start" />
          Created
          {dateCount > 0 && <span className="ml-0.5 rounded-full bg-brand px-1.5 text-[10px] font-semibold text-brand-foreground">{dateCount}</span>}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <CreatedRange
            // Remount when the URL-driven values change so the drafts reset.
            key={`${filters.created_after ?? ""}|${filters.created_before ?? ""}`}
            filters={filters}
            onChange={onChange}
          />
        </PopoverContent>
      </Popover>

      {hasFilters && (
        <Button variant="ghost" size="default" onClick={onClear} className="text-muted-foreground">
          <XIcon data-icon="inline-start" />
          Clear
        </Button>
      )}
    </div>
  );
}
