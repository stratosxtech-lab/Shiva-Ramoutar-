"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Nav, api } from "@/components/ui";
import type { Plan } from "@/lib/plans";

type Config = { settings: { pricingPage: boolean; enquiries: boolean; checkout: boolean }; plans: Plan[] };

export default function Pricing() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [buyError, setBuyError] = useState("");

  async function buy(planId: string) {
    setBuyError(""); setBuying(planId);
    try {
      const r = await api<{ url: string }>("/api/checkout", { body: { plan: planId } });
      location.href = r.url;
    } catch (e) { setBuyError((e as Error).message); setBuying(null); }
  }
  useEffect(() => { api<Config>("/api/config").then(setCfg).catch(() => {}); }, []);

  if (!cfg) return <div className="wide"><Nav current="pricing" /><p className="muted">Loading plans…</p></div>;
  if (!cfg.settings.pricingPage) {
    return <div className="wide"><Nav current="pricing" /><h1>Pricing</h1><p className="notice">Plans will be announced soon.</p></div>;
  }
  const by = (a: Plan["audience"]) => cfg.plans.filter((p) => p.audience === a);
  const card = (p: Plan, featured = false) => (
    <div className={`plan ${featured ? "featured" : ""}`} key={p.id}>
      <div className="row between"><h3>{p.name}</h3>{featured && <span className="badge ok">Most popular</span>}</div>
      <div className="price">{p.price}<small>{p.cadence}</small></div>
      <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
      {p.id === "free" ? (
        <Link className="btn ghost" href="/">Play free</Link>
      ) : cfg.settings.checkout && p.cents != null ? (
        <button className={`btn ${featured ? "" : "ghost"}`} disabled={buying !== null} onClick={() => buy(p.id)}>
          {buying === p.id ? "Opening checkout…" : p.usage === "subscription" ? "Subscribe" : "Buy now"}
        </button>
      ) : (
        <button className={`btn ${featured ? "" : "ghost"}`} onClick={() => setChosen(p.id)}>
          {p.audience === "corporate" ? "Talk to us" : "Get early access"}
        </button>
      )}
    </div>
  );

  return (
    <div className="wide">
      <Nav current="pricing" />
      <div className="section-title">
        <span className="eyebrow">Plans</span>
        <h1>Play for free. Upgrade for bigger games.</h1>
        <p className="lede">Classic games for up to 6 players are free. Choose a plan for every game mode, bigger groups and team events.</p>
      </div>
      {!cfg.settings.checkout && cfg.settings.enquiries && <p className="notice">Online checkout opens soon. Sign up now and we&apos;ll send your access code as soon as it&apos;s live.</p>}
      {cfg.settings.checkout && <p className="muted">Secure card payment by Stripe. Your access code appears as soon as payment completes.</p>}
      {buyError && <div className="error" role="alert">{buyError}</div>}

      <h2>For individuals</h2>
      <div className="plans">{by("individual").map((p) => card(p, true))}{by("free").map((p) => card(p))}</div>

      <h2>For groups</h2>
      <p className="muted">One-off passes for parties, camps, schools and clubs. Whoever buys becomes the group&apos;s organiser.</p>
      <div className="plans">{by("group").map((p, i) => card(p, i === 1))}</div>

      <h2>For companies</h2>
      <p className="muted">Team-building, onboarding and offsites. The buyer becomes the team&apos;s super user, with a dashboard to add hosts, control settings and see results.</p>
      <div className="plans">{by("corporate").map((p, i) => card(p, i === 1))}</div>

      {chosen && <LeadForm plan={cfg.plans.find((p) => p.id === chosen)!} open={cfg.settings.enquiries} onClose={() => setChosen(null)} />}

      <div className="card">
        <h3>Already bought a Group or Corporate plan?</h3>
        <p className="muted">Set up your team with the access code we sent you.</p>
        <Link className="btn ghost" href="/team/new">Set up my team</Link>
      </div>
    </div>
  );
}

function LeadForm({ plan, open, onClose }: { plan: Plan; open: boolean; onClose: () => void }) {
  const corporate = plan.audience === "corporate";
  const [f, setF] = useState({ name: "", email: "", company: "", teamSize: "", eventDate: "", message: "" });
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setState("busy");
    try {
      await api("/api/leads", { body: { ...f, kind: corporate ? "corporate" : "signup", plan: plan.id } });
      setState("done");
    } catch (err) { setError((err as Error).message); setState("idle"); }
  }

  if (!open) return <div className="card"><p className="notice">We&apos;re not taking sign-ups right now. Please check back soon.</p></div>;
  return (
    <form className="card" onSubmit={submit} id="lead-form">
      <div className="row between"><h3>{corporate ? `Enquire about ${plan.name}` : `Get early access: ${plan.name}`}</h3>
        <button type="button" className="btn ghost sm" onClick={onClose}>Close</button></div>
      {state === "done" ? (
        <p className="notice">Thank you. We&apos;ve got your details and will be in touch within one business day.</p>
      ) : (
        <>
          {error && <div className="error" role="alert">{error}</div>}
          <div className="split">
            <label>Your name<input id="lead-name" value={f.name} onChange={set("name")} autoComplete="name" /></label>
            <label>Work email<input id="lead-email" type="email" value={f.email} onChange={set("email")} autoComplete="email" /></label>
            {corporate && <label>Company<input id="lead-company" value={f.company} onChange={set("company")} autoComplete="organization" /></label>}
            {corporate && <label>Number of employees playing<input id="lead-size" inputMode="numeric" value={f.teamSize} onChange={set("teamSize")} /></label>}
            {corporate && <label>Preferred event date<input id="lead-date" value={f.eventDate} onChange={set("eventDate")} placeholder="e.g. March 2027" /></label>}
          </div>
          {corporate && <label>Anything we should know?<textarea id="lead-msg" rows={3} value={f.message} onChange={set("message")} style={{ width: "100%", background: "var(--dusk)", color: "var(--mist)", border: "1px solid var(--dusk-3)", borderRadius: 12, padding: 12, font: "inherit" }} /></label>}
          <button className="btn" disabled={state === "busy"}>{corporate ? "Send enquiry" : "Sign me up"}</button>
        </>
      )}
    </form>
  );
}
