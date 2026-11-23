"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { setAuthenticated } from "@/components/auth-gate";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    window.setTimeout(() => {
      if (!email.trim() || password.length < 4) {
        setError("Enter email and a password (4+ characters).");
        setBusy(false);
        return;
      }
      setAuthenticated(true);
      router.replace("/");
    }, 400);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/logo.svg" alt="" width={40} height={40} className="brand-logo" />
          <span>Veytrix</span>
        </div>
        <h1>Sign in</h1>
        <p className="login-sub">Access your workspace</p>
        <form onSubmit={onSubmit} className="login-form">
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={4}
            />
          </label>
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="login-submit" disabled={busy}>
            {busy ? "Signing in…" : "Continue"}
          </button>
        </form>
        <p className="login-foot">
          Session stays in this browser. No broker credentials are collected.
        </p>
      </div>
    </div>
  );
}
