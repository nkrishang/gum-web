"use client";

import * as React from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createGumClient, GumApiError } from "./client";
import type { Account, DepositFilters } from "./types";

/**
 * True while the user is signing out. Every query is disabled for that moment
 * so it keeps showing what it has instead of refetching without a token and
 * flashing an error before the navigation away lands.
 */
export const QueriesPausedContext = React.createContext(false);

export const queryKeys = {
  account: ["account"] as const,
  chains: ["chains"] as const,
  deposits: (filters: DepositFilters) => ["deposits", filters] as const,
};

export function useGum() {
  const { getAccessToken } = usePrivy();
  return React.useMemo(() => createGumClient(getAccessToken), [getAccessToken]);
}

export function useAccount() {
  const gum = useGum();
  const paused = React.useContext(QueriesPausedContext);
  return useQuery({ queryKey: queryKeys.account, queryFn: gum.account.get, enabled: !paused });
}

export function useChains() {
  const gum = useGum();
  const paused = React.useContext(QueriesPausedContext);
  return useQuery({
    queryKey: queryKeys.chains,
    queryFn: gum.chains.list,
    enabled: !paused,
    staleTime: 60 * 60 * 1000,
    select: (data) => data.chains,
  });
}

export function useDeposits(filters: DepositFilters) {
  const gum = useGum();
  const paused = React.useContext(QueriesPausedContext);
  return useInfiniteQuery({
    queryKey: queryKeys.deposits(filters),
    queryFn: ({ pageParam }) => gum.deposits.list(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: !paused,
    refetchInterval: paused ? false : 15_000,
  });
}

export function describeError(error: unknown): string {
  if (error instanceof GumApiError) {
    return error.code === "auth_unavailable"
      ? "Sign-in verification is not configured on the API yet."
      : error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function useCreateApiKey() {
  const gum = useGum();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: gum.account.createKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.account }),
  });
}

export function useRotateApiKey() {
  const gum = useGum();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: gum.account.rotateKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.account }),
  });
}

export function useUpdateWebhookUrl() {
  const gum = useGum();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string | null) => gum.account.update(url),
    onSuccess: (account: Account) => qc.setQueryData(queryKeys.account, account),
  });
}

export function useRotateWebhookSecret() {
  const gum = useGum();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: gum.account.rotateWebhookSecret,
    onSuccess: (account: Account) => qc.setQueryData(queryKeys.account, account),
  });
}
