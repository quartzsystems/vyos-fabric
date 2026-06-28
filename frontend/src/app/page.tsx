"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";

/// Root gate: force authentication before anything else.
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getToken() ? "/controller/sites" : "/login");
  }, [router]);

  return null;
}
