"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchMe } from "@/lib/api";

/// Root gate: confirm the session (httpOnly cookie) before routing anywhere.
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    fetchMe()
      .then(() => router.replace("/controller/sites"))
      .catch(() => router.replace("/login"));
  }, [router]);

  return null;
}
