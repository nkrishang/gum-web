import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginCard } from "@/components/auth/login-card";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Suspense fallback={null}>
        <LoginCard />
      </Suspense>
    </main>
  );
}
