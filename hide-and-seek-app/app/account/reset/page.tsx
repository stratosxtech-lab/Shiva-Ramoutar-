"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Nav, api } from "@/components/ui";

export default function Reset() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setToken(new URLSearchParams(location.hash.slice(1)).get("token") ?? "");
    history.replaceState(null, "", location.pathname);
  }, []);
  return (
    <div className="wide" style={{ maxWidth: 520 }}>
      <Nav current="account" />
      <h1>Choose a new password</h1>
      <form className="card" onSubmit={async (e) => {
        e.preventDefault(); setError("");
        try { await api("/api/auth/reset", { body: { token, password } }); router.push("/account"); }
        catch (err) { setError((err as Error).message); }
      }}>
        {error && <div className="error" role="alert">{error}</div>}
        <label>New password<input id="r-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" /></label>
        <p className="muted">At least 8 characters. You&apos;ll be signed out everywhere else.</p>
        <button className="btn" disabled={!token}>Save new password</button>
      </form>
    </div>
  );
}
