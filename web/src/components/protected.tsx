"use client";

import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function Protected({ children }: { children: React.ReactNode }) {
  const r = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      r.replace("/login");
      return;
    }
    setOk(true);
  }, [r]);

  if (!ok) return null;
  return <>{children}</>;
}
