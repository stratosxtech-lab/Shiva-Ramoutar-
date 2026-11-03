"use client";

import { useEffect, useRef, useState } from "react";

/** A hider's tag shown as a QR code. Encodes the game and the 4-digit code. */
export function TagQR({ game, tag }: { game: string; tag: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    import("qrcode").then((QR) =>
      QR.toString(`HS:${game}:${tag}`, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#121C26", light: "#FFFFFF" } }),
    ).then((s) => { if (live) setSvg(s); }).catch(() => {});
    return () => { live = false; };
  }, [game, tag]);
  if (!svg) return null;
  return (
    <div role="img" aria-label={`QR code for tag ${tag}`}
      style={{ width: 180, maxWidth: "100%", margin: "0 auto", background: "#fff", borderRadius: 14, padding: 8 }}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

/** Reads a hider's QR code with the phone's rear camera. Returns the 4-digit tag for this game. */
export function Scanner({ game, onTag, onClose }: { game: string; onTag: (tag: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, done = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const { default: jsQR } = await import("jsqr");
        let last = 0;
        const tick = (t: number) => {
          if (done) return;
          raf = requestAnimationFrame(tick);
          if (t - last < 150 || !v.videoWidth || !ctx) return;
          last = t;
          const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * w);
          canvas.width = w; canvas.height = h;
          ctx.drawImage(v, 0, 0, w, h);
          const hit = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
          const m = hit?.data.match(/^HS:([A-Z0-9-]+):(\d{4})$/);
          if (m) {
            if (m[1] !== game) { setError(`That QR code is for game ${m[1]}, not ${game}.`); return; }
            done = true;
            onTag(m[2]);
          }
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError("The camera couldn't start. Allow camera access for this site, or type the 4-digit code instead.");
      }
    })();

    return () => { done = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [game, onTag]);

  return (
    <div className="card" style={{ gap: 8 }}>
      <div className="row between"><h3>Scan the hider&apos;s QR code</h3><button className="btn ghost sm" onClick={onClose}>Close</button></div>
      {error && <p className="error">{error}</p>}
      <video ref={video} playsInline muted style={{ width: "100%", borderRadius: 14, background: "#000", aspectRatio: "3 / 4", objectFit: "cover" }} />
      <p className="muted">Point your camera at the code on their screen. It tags them automatically.</p>
    </div>
  );
}
