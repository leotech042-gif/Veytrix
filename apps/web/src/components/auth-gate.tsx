"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

const STORAGE_KEY = "veytrix.session";

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAuthenticated(value: boolean) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const authed = isAuthenticated();
    setOk(authed);
    setReady(true);
    if (!authed && pathname !== "/login") {
      router.replace("/login");
    }
    if (authed && pathname === "/login") {
      router.replace("/");
    }
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="auth-boot" role="status">
        Loading…
      </div>
    );
  }

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (!ok) {
    return (
      <div className="auth-boot" role="status">
        Redirecting…
      </div>
    );
  }

  return <>{children}</>;
}
