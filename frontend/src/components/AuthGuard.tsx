"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";

/// Client-side auth gate for snappy redirects. The server enforces auth on every
/// request, so a missing/expired token is rejected there too; this just avoids
/// rendering protected UI when there's no token.
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setAuthed(true);
  }, [router]);

  if (!authed) return null;
  return <>{children}</>;
}
