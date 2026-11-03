"use client";

import { fmtDate } from "./ui";

export type ReportData = {
  team: string; plan: string; period: { from: string | null; to: string | null }; generatedAt: string;
  summary: { events: number; finished: number; participations: number; uniquePlayers: number; repeatPlayers: number; repeatRate: number;
    averageGroup: number; playMinutes: number; tags: number; findRate: number; activeHosts: number; hostsOnTeam: number };
  hosts: { name: string; events: number }[];
  leaderboard: { name: string; games: number; points: number; tags: number; wins: number }[];
  games: { date: string; code: string; mode: string; host: string | null; players: number; minutes: number; tags: number; winner: string | null; winnerScore: number | null; finished: boolean }[];
};
const MODE_LABEL: Record<string, string> = { classic: "Classic", infection: "Infection", shadow: "Shadow Teams", duel: "Decoy Duel", indoor: "Indoor" };

/** Plain-language headline findings a leader can read in ten seconds. */
export function headlines(r: ReportData) {
  const s = r.summary;
  if (!s.events) return ["No games have been played in this period yet."];
  const out = [
    `${s.events} event${s.events === 1 ? "" : "s"} brought together ${s.uniquePlayers} people across ${s.participations} participations.`,
    `${s.repeatRate}% of players came back for more than one game.`,
    `Groups averaged ${s.averageGroup} players, with ${s.playMinutes} minutes of active play in total.`,
  ];
  if (s.hostsOnTeam) out.push(`${s.activeHosts} of ${s.hostsOnTeam} hosts ran at least one game.`);
  return out;
}

export function ReportView({ r }: { r: ReportData }) {
  const s = r.summary;
  return (
    <div className="report">
      <div className="stats">
        <div className="stat"><b>{s.events}</b><small>Events held</small></div>
        <div className="stat"><b>{s.uniquePlayers}</b><small>Unique players</small></div>
        <div className="stat"><b>{s.repeatRate}%</b><small>Came back again</small></div>
        <div className="stat"><b>{s.averageGroup}</b><small>Average group</small></div>
        <div className="stat"><b>{s.playMinutes}</b><small>Minutes of play</small></div>
        <div className="stat"><b>{s.findRate}%</b><small>Hiders found</small></div>
      </div>
      <div className="card">
        <h3>Key findings</h3>
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          {headlines(r).map((h) => <li key={h}>{h}</li>)}
        </ul>
      </div>
      <div className="split">
        <div className="card">
          <h3>Top players</h3>
          {r.leaderboard.length === 0 ? <p className="muted">No finished games yet.</p> : (
            <div className="list">
              {r.leaderboard.map((p, i) => (
                <div className="item" key={p.name}><span>{i + 1}. {p.name} <span className="muted small">· {p.games} game{p.games === 1 ? "" : "s"}, {p.wins} win{p.wins === 1 ? "" : "s"}</span></span><span className="num">{p.points}</span></div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3>Hosts</h3>
          {r.hosts.length === 0 ? <p className="muted">No games hosted yet.</p> : (
            <div className="list">
              {r.hosts.map((h) => <div className="item" key={h.name}><span>{h.name}</span><span className="num">{h.events} event{h.events === 1 ? "" : "s"}</span></div>)}
            </div>
          )}
        </div>
      </div>
      <div className="tbl"><table>
        <thead><tr><th>Date</th><th>Mode</th><th>Host</th><th>Players</th><th>Minutes</th><th>Tags</th><th>Winner</th></tr></thead>
        <tbody>
          {r.games.length === 0 && <tr><td colSpan={7} className="muted">No games in this period.</td></tr>}
          {r.games.map((g) => (
            <tr key={g.code}>
              <td>{fmtDate(g.date)}</td><td>{MODE_LABEL[g.mode] ?? g.mode}</td><td>{g.host ?? "Owner"}</td>
              <td className="mono">{g.players}</td><td className="mono">{g.minutes}</td><td className="mono">{g.tags}</td>
              <td>{g.finished ? `${g.winner ?? "—"}${g.winnerScore != null ? ` (${g.winnerScore})` : ""}` : "In progress"}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
