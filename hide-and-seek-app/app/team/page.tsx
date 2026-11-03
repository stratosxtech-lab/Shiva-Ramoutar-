"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/ui";

export default function TeamHome() {
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    try { setTeams(JSON.parse(localStorage.getItem("hs:teams") ?? "[]")); } catch {}
  }, []);
  return (
    <div className="wide">
      <Nav current="team" />
      <div className="section-title">
        <span className="eyebrow">Team edition</span>
        <h1>Run Hide &amp; Seek for your team</h1>
        <p className="lede">The person who buys a Group or Corporate plan becomes the team&apos;s super user. From the dashboard you add hosts, choose which features your team uses, and see every game.</p>
      </div>
      {teams.length > 0 && (
        <div className="card" style={{ maxWidth: 520 }}>
          <h3>Your teams on this device</h3>
          <div className="list">
            {teams.map((t) => (
              <div className="item" key={t.id}><span>{t.name}</span><Link className="btn sm" href={`/team/${t.id}`}>Open dashboard</Link></div>
            ))}
          </div>
        </div>
      )}
      <div className="split">
        <div className="card">
          <h3>Set up a new team</h3>
          <p className="muted">You&apos;ll need the access code from your Group or Corporate purchase.</p>
          <Link className="btn" href="/team/new">Set up my team</Link>
        </div>
        <div className="card">
          <h3>Using another device?</h3>
          <p className="muted">Open the private dashboard link you saved when you set up your team. It signs you in on any device.</p>
          <Link className="btn ghost" href="/pricing">See Group and Corporate plans</Link>
        </div>
      </div>
    </div>
  );
}
