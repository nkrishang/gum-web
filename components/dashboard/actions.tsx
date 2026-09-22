"use client";

import * as React from "react";

/**
 * Flows one section can start in another: the deposits empty state asks for
 * a key or a webhook endpoint, and the section that owns that flow opens it
 * and scrolls itself into view.
 */
export type DashboardFlow = "create-api-key" | "set-webhook-endpoint";

type Actions = {
  pending: DashboardFlow | null;
  start: (flow: DashboardFlow) => void;
  /** Called by the section that picked the flow up, so it does not fire twice. */
  consume: (flow: DashboardFlow) => void;
};

const DashboardActionsContext = React.createContext<Actions>({
  pending: null,
  start: () => {},
  consume: () => {},
});

export function DashboardActionsProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<DashboardFlow | null>(null);
  const value = React.useMemo<Actions>(
    () => ({
      pending,
      start: setPending,
      consume: (flow) => setPending((current) => (current === flow ? null : current)),
    }),
    [pending],
  );
  return <DashboardActionsContext.Provider value={value}>{children}</DashboardActionsContext.Provider>;
}

export function useDashboardActions() {
  return React.useContext(DashboardActionsContext);
}

/**
 * Runs `open` once when `flow` is requested, then scrolls the section into
 * view. Sections that are still loading pick the request up on mount.
 */
export function useFlowRequest(flow: DashboardFlow, sectionId: string, open: () => void) {
  const { pending, consume } = useDashboardActions();
  React.useEffect(() => {
    if (pending !== flow) return;
    consume(flow);
    open();
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    // `open` is a fresh closure each render; the request is consumed on the first run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, flow, sectionId, consume]);
}
