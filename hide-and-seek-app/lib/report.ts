import { db } from "./db";
import { PLANS, PlanId } from "./plans";

type Team = { id: string; name: string; access_code: string };

/** Engagement report for a team's leadership: totals, participation, hosts, top players and every game. */
export async function teamReport(t: Team, fromInput?: string | null, toInput?: string | null) {
  const sql = await db();
  const valid = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const from = valid(fromInput) ?? "2000-01-01";
  const to = valid(toInput) ?? "2999-12-31";

  const games = await sql<{
    code: string; created_at: Date; mode: string; status: string; host: string | null; players: number;
    found: number; hiders: number; tags: number; minutes: number; winner: string | null; winner_score: number | null;
  }[]>`
    SELECT g.code, g.created_at, g.mode, g.status,
      coalesce((SELECT name FROM hs_team_members m WHERE m.id = g.host_member), 'Owner') AS host,
      (SELECT count(*)::int FROM hs_players p WHERE p.game_code = g.code) AS players,
      (SELECT count(*)::int FROM hs_players p WHERE p.game_code = g.code AND p.found_at IS NOT NULL) AS found,
      (SELECT count(*)::int FROM hs_players p WHERE p.game_code = g.code AND (p.role = 'hider' OR p.found_at IS NOT NULL)) AS hiders,
      (SELECT coalesce(sum(tags), 0)::int FROM hs_players p WHERE p.game_code = g.code) AS tags,
      CASE WHEN g.started_at IS NULL THEN 0
           ELSE round(extract(epoch FROM (coalesce(g.ended_at, now()) - g.started_at)) / 60)::int END AS minutes,
      (SELECT name FROM hs_players p WHERE p.game_code = g.code AND g.status = 'ended' ORDER BY score DESC LIMIT 1) AS winner,
      (SELECT score FROM hs_players p WHERE p.game_code = g.code AND g.status = 'ended' ORDER BY score DESC LIMIT 1) AS winner_score
    FROM hs_games g
    WHERE g.team_id = ${t.id} AND g.started_at IS NOT NULL
      AND g.created_at >= ${from}::date AND g.created_at < (${to}::date + 1)
    ORDER BY g.created_at`;

  const codes = games.map((g) => g.code);
  const people = codes.length
    ? await sql<{ name: string; games: number; points: number; tags: number; wins: number }[]>`
        SELECT lower(p.name) AS key, min(p.name) AS name, count(*)::int AS games, coalesce(sum(p.score), 0)::int AS points,
          coalesce(sum(p.tags), 0)::int AS tags,
          count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM hs_players x WHERE x.game_code = p.game_code AND x.score > p.score)
            AND (SELECT status FROM hs_games WHERE code = p.game_code) = 'ended')::int AS wins
        FROM hs_players p WHERE p.game_code = ANY(${codes})
        GROUP BY lower(p.name) ORDER BY points DESC`
    : [];
  const [members] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM hs_team_members WHERE team_id = ${t.id} AND active`;
  const hostRows = new Map<string, number>();
  for (const g of games) hostRows.set(g.host ?? "Owner", (hostRows.get(g.host ?? "Owner") ?? 0) + 1);
  const [ac] = await sql<{ plan: PlanId }[]>`SELECT plan FROM hs_access_codes WHERE code = ${t.access_code}`;

  const participations = games.reduce((s, g) => s + g.players, 0);
  const finished = games.filter((g) => g.status === "ended").length;
  const hiders = games.reduce((s, g) => s + g.hiders, 0);
  const found = games.reduce((s, g) => s + g.found, 0);
  const repeat = people.filter((p) => p.games > 1).length;

  return {
    team: t.name,
    plan: PLANS[ac.plan].name,
    period: { from: valid(fromInput), to: valid(toInput) },
    generatedAt: new Date().toISOString(),
    summary: {
      events: games.length,
      finished,
      participations,
      uniquePlayers: people.length,
      repeatPlayers: repeat,
      repeatRate: people.length ? Math.round((repeat / people.length) * 100) : 0,
      averageGroup: games.length ? Math.round((participations / games.length) * 10) / 10 : 0,
      playMinutes: games.reduce((s, g) => s + g.minutes, 0),
      tags: games.reduce((s, g) => s + g.tags, 0),
      findRate: hiders ? Math.round((found / hiders) * 100) : 0,
      activeHosts: hostRows.size,
      hostsOnTeam: members.n,
    },
    hosts: [...hostRows.entries()].map(([name, events]) => ({ name, events })).sort((a, b) => b.events - a.events),
    leaderboard: people.slice(0, 10).map(({ name, games, points, tags, wins }) => ({ name, games, points, tags, wins })),
    games: games.map((g) => ({
      date: g.created_at, code: g.code, mode: g.mode, host: g.host, players: g.players, minutes: g.minutes,
      tags: g.tags, winner: g.winner, winnerScore: g.winner_score, finished: g.status === "ended",
    })),
  };
}

export type Report = Awaited<ReturnType<typeof teamReport>>;

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // stop spreadsheet formula injection
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function reportCsv(r: Report) {
  const rows: unknown[][] = [
    ["Hide & Seek engagement report"], ["Team", r.team], ["Plan", r.plan],
    ["Period", `${r.period.from ?? "All time"} to ${r.period.to ?? "today"}`], [],
    ["Summary"], ["Events held", r.summary.events], ["Total participations", r.summary.participations],
    ["Unique players", r.summary.uniquePlayers], ["Repeat players (%)", r.summary.repeatRate],
    ["Average group size", r.summary.averageGroup], ["Minutes of play", r.summary.playMinutes],
    ["Hiders found (%)", r.summary.findRate], ["Active hosts", r.summary.activeHosts], [],
    ["Games"], ["Date", "Game", "Mode", "Host", "Players", "Minutes", "Tags", "Winner", "Winning score"],
    ...r.games.map((g) => [new Date(g.date).toISOString().slice(0, 10), g.code, g.mode, g.host, g.players, g.minutes, g.tags, g.winner ?? "", g.winnerScore ?? ""]),
    [], ["Top players"], ["Name", "Games", "Points", "Tags", "Wins"],
    ...r.leaderboard.map((p) => [p.name, p.games, p.points, p.tags, p.wins]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
