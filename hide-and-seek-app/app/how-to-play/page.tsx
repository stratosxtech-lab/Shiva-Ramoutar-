import Link from "next/link";
import { Nav } from "@/components/ui";

export const metadata = { title: "How to play · Hide & Seek" };

const MODES = [
  ["Classic", "One seeker finds everyone else. Found hiders sit out. Best for first games.", "2 or more"],
  ["Infection", "Every hider who's found joins the seekers, so the hunt speeds up.", "3 or more"],
  ["Shadow Teams", "Red team hides while Blue seeks, then they swap. The team with more points wins.", "4 or more"],
  ["Decoy Duel", "Hiders get three decoys that pull the seekers' map the wrong way. Each seeker gets one reveal pulse that sees through them.", "3 or more"],
  ["Indoor", "For a house or office. No GPS: hiders' phones chirp every minute, so seekers listen.", "2 or more"],
];

export default function HowToPlay() {
  return (
    <div className="wide" style={{ maxWidth: 680 }}>
      <Nav />
      <div className="section-title">
        <span className="eyebrow">How to play</span>
        <h1>Hide &amp; Seek in one minute</h1>
        <p className="lede">It&apos;s the hide and seek you know. Everyone plays in the same place on their own phone, and the app runs the timer, gives seekers clues and keeps score.</p>
      </div>

      <div className="card">
        <h3>Start a game</h3>
        <ol className="steps">
          <li>One person taps <b>Host a game</b>, picks a game and taps <b>Create game</b>.</li>
          <li>They get a code like <b>LANTERN-42</b>. Everyone else taps <b>Join a game</b> and types it.</li>
          <li>When everyone&apos;s in, the host stands in the middle of the play area and taps <b>Start game</b>.</li>
          <li>The app picks the seeker at random and tells each person their role.</li>
        </ol>
      </div>

      <div className="split">
        <div className="card" style={{ borderLeft: "4px solid var(--lantern)" }}>
          <span className="role hider" style={{ alignSelf: "flex-start" }}>Hider</span>
          <ol className="steps">
            <li>Turn on the chirp sound when asked.</li>
            <li>Hide before the head start runs out. Stay inside the dashed circle.</li>
            <li>Stay hidden. The longer you last, the more points you get.</li>
            <li>If a seeker finds you, show them your QR code.</li>
          </ol>
        </div>
        <div className="card" style={{ borderLeft: "4px solid var(--ember)" }}>
          <span className="role seeker" style={{ alignSelf: "flex-start" }}>Seeker</span>
          <ol className="steps">
            <li>Wait and count while the hiders get their head start.</li>
            <li>Then follow the orange circle on your map. Hiders are somewhere inside it, and it gets smaller over time.</li>
            <li>Listen for chirps from hiders&apos; phones.</li>
            <li>Found someone? Tap <b>Scan their QR code</b> and point your camera at their phone.</li>
          </ol>
        </div>
      </div>

      <div className="card">
        <h3>Scoring</h3>
        <p>Seekers get 150 points for each hider they find. Hiders get 1 point for every 2 seconds they stay hidden, plus 200 if they&apos;re never found. Highest score wins.</p>
      </div>

      <h2>Games you can play</h2>
      <div className="tbl"><table>
        <thead><tr><th>Game</th><th>How it works</th><th>Players</th></tr></thead>
        <tbody>{MODES.map(([n, d, p]) => <tr key={n}><td><b>{n}</b></td><td>{d}</td><td>{p}</td></tr>)}</tbody>
      </table></div>
      <p className="muted">Classic is free for up to 6 players. The other games come with a paid plan.</p>

      <div className="card">
        <h3>Play safely</h3>
        <ul className="steps">
          <li>Agree the boundaries before you start, and avoid roads, water and private property.</li>
          <li>Play in daylight, and keep younger players in pairs.</li>
          <li>Your exact location is never shown to other players. Seekers only see a rough circle.</li>
        </ul>
      </div>

      <Link href="/" className="btn big">Play now</Link>
    </div>
  );
}
