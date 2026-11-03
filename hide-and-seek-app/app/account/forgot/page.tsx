"use client";

import { useState } from "react";
import Link from "next/link";
import { Nav, api } from "@/components/ui";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="wide" style={{ maxWidth: 520 }}>
      <Nav current="account" />
      <h1>Reset your password</h1>
      {sent ? (
        <div className="card">
          <p>If an account uses that email, we&apos;ve sent a reset link. It works for one hour.</p>
          <Link className="btn ghost" href="/account">Back to sign in</Link>
        </div>
      ) : (
        <form className="card" onSubmit={async (e) => {
          e.preventDefault(); setError("");
          try { await api("/api/auth/forgot", { body: { email } }); setSent(true); } catch (err) { setError((err as Error).message); }
        }}>
          {error && <div className="error" role="alert">{error}</div>}
          <label>Email<input id="f-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <button className="btn">Email me a reset link</button>
        </form>
      )}
    </div>
  );
}
