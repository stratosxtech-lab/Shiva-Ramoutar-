"use client";

const DIRS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
/** Turns a bearing in degrees (0 = north) into words like "north-east". */
export const compass = (deg: number) => DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

/** The nearest mystery box: a big Grab button when you're close, otherwise how far and which way. */
export function BoxCard({ boxes, me, range, busy, onGrab }: {
  boxes: { id: string; x: number; y: number; expiresIn: number }[];
  me: { x: number; y: number } | null; range: number; busy: boolean; onGrab: (id: string) => void;
}) {
  if (!boxes.length) return null;
  if (!me) return <p className="notice">A mystery box is on the map. Turn on location to go and grab it.</p>;
  const ranked = boxes.map((b) => {
    const dx = b.x - me.x, dy = b.y - me.y;
    return { ...b, d: Math.round(Math.hypot(dx, dy)), bearing: (Math.atan2(dx, dy) * 180) / Math.PI };
  }).sort((a, b) => a.d - b.d);
  const b = ranked[0];
  const close = b.d <= range;
  return (
    <div className="card box-card">
      <div className="row between">
        <h3>{close ? "You're at a mystery box!" : "Mystery box nearby"}</h3>
        <span className="badge ok">{mmss(b.expiresIn)} left</span>
      </div>
      {close ? (
        <button className="btn big green" disabled={busy} onClick={() => onGrab(b.id)}>Grab it!</button>
      ) : (
        <p>About <b>{b.d} m {compass(b.bearing)}</b> of you. Get within {range} m to grab a random power-up. Others can see it too, so be quick.</p>
      )}
    </div>
  );
}

/** Active power-ups and game-wide effects, with countdowns. */
export function Effects({ me, squeeze, final }: {
  me: { shield: number; ghost: number; tracker: { seconds: number } | null };
  squeeze: number; final: boolean;
}) {
  const chips: [string, string][] = [];
  if (final) chips.push(["Final countdown: finds are worth double", "final"]);
  if (me.shield) chips.push([`Shield: can't be tagged · ${me.shield}s`, "good"]);
  if (me.ghost) chips.push([`Ghost: off the seekers' map · ${me.ghost}s`, "good"]);
  if (me.tracker) chips.push([`Tracker on · ${me.tracker.seconds}s`, "good"]);
  if (squeeze) chips.push([`Squeeze: warm zone halved · ${squeeze}s`, "warn"]);
  if (!chips.length) return null;
  return <div className="effects">{chips.map(([t, k]) => <span key={t} className={`effect ${k}`}>{t}</span>)}</div>;
}

/** The Freeze! event: a warning just before, a big alarm during. */
export function FreezeAlert({ freeze, serverNow, role, found }: {
  freeze: { startsAt: number; endsAt: number } | null; serverNow: number; role: "seeker" | "hider"; found: boolean;
}) {
  if (!freeze) return null;
  const toStart = (freeze.startsAt - serverNow) / 1000;
  const toEnd = (freeze.endsAt - serverNow) / 1000;
  if (toStart > 0 && toStart <= 15) {
    return <div className="freeze soon" role="alert"><b>Freeze! in {Math.ceil(toStart)}s</b><span>{role === "hider" && !found ? "Get somewhere you can stay still." : "Get ready to watch for movement."}</span></div>;
  }
  if (toStart <= 0 && toEnd > 0) {
    return (
      <div className="freeze on" role="alert">
        <b>FREEZE! {Math.ceil(toEnd)}s</b>
        <span>{role === "hider" && !found ? "Don't move! If you move more than 20 m, seekers see exactly where you are." : "Hiders who move now will appear on your map."}</span>
      </div>
    );
  }
  return null;
}
