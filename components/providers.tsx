"use client";

import * as React from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { privyAppId, privyClientId } from "@/lib/env";

/** True when NEXT_PUBLIC_PRIVY_APP_ID is set. The login page reads this to explain setup. */
export const PrivyConfiguredContext = React.createContext<boolean>(false);

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: (count, error) => {
              // Do not hammer the API on auth errors.
              const status = (error as { status?: number })?.status;
              if (status && status >= 400 && status < 500) return false;
              return count < 2;
            },
          },
        },
      }),
  );

  const tree = (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {children}
      </TooltipProvider>
    </QueryClientProvider>
  );

  return (
    <PrivyConfiguredContext.Provider value={Boolean(privyAppId)}>
      {privyAppId ? (
        <PrivyProvider
          appId={privyAppId}
          clientId={privyClientId || undefined}
          config={{
            loginMethods: ["email"],
            appearance: {
              theme: "light",
              accentColor: "#FF5CA8",
              logo: "/brand/gum-wordmark-transparent-dark.png",
              landingHeader: "Sign in to Gum",
              loginMessage: "Manage your API key, webhook and deposits.",
            },
            embeddedWallets: {
              ethereum: { createOnLogin: "off" },
              solana: { createOnLogin: "off" },
            },
          }}
        >
          {tree}
        </PrivyProvider>
      ) : (
        tree
      )}
    </PrivyConfiguredContext.Provider>
  );
}
