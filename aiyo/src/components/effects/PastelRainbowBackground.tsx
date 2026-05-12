"use client";

import { useEffect, useRef } from "react";

const PASTEL_COLORS = [
  { r: 255, g: 182, b: 193 },
  { r: 255, g: 218, b: 185 },
  { r: 255, g: 255, b: 186 },
  { r: 186, g: 255, b: 201 },
  { r: 186, g: 225, b: 255 },
  { r: 221, g: 186, b: 255 },
  { r: 255, g: 186, b: 239 },
];

interface Orb {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  colorIdx: number;
  phase: number;
  driftX: number;
  driftY: number;
  speed: number;
}

const ORB_COUNT = 5;

export default function PastelRainbowBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      canvas!.width = parent.clientWidth;
      canvas!.height = parent.clientHeight;
    }
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const orbs: Orb[] = Array.from({ length: ORB_COUNT }, (_, i) => ({
      cx: Math.random(),
      cy: Math.random(),
      rx: 0.25 + Math.random() * 0.2,
      ry: 0.2 + Math.random() * 0.15,
      colorIdx: i % PASTEL_COLORS.length,
      phase: Math.random() * Math.PI * 2,
      driftX: (Math.random() - 0.5) * 0.0003,
      driftY: (Math.random() - 0.5) * 0.0003,
      speed: 0.0004 + Math.random() * 0.0003,
    }));

    function draw(time: number) {
      const w = canvas!.width;
      const h = canvas!.height;

      ctx!.fillStyle = "#ffffff";
      ctx!.fillRect(0, 0, w, h);

      for (const orb of orbs) {
        const t = time * orb.speed + orb.phase;
        const x = (orb.cx + Math.sin(t) * 0.08 + Math.sin(t * 0.7) * 0.04) * w;
        const y = (orb.cy + Math.cos(t * 0.9) * 0.06 + Math.cos(t * 0.5) * 0.03) * h;
        const radX = orb.rx * w;
        const radY = orb.ry * h;

        const ci = Math.floor(((time * 0.00008 + orb.phase) % 1) * PASTEL_COLORS.length);
        const ni = (ci + 1) % PASTEL_COLORS.length;
        const blend = ((time * 0.00008 + orb.phase) % 1) * PASTEL_COLORS.length - ci;

        const c = PASTEL_COLORS[(orb.colorIdx + ci) % PASTEL_COLORS.length];
        const n = PASTEL_COLORS[(orb.colorIdx + ni) % PASTEL_COLORS.length];
        const r = Math.round(c.r + (n.r - c.r) * blend);
        const g = Math.round(c.g + (n.g - c.g) * blend);
        const b = Math.round(c.b + (n.b - c.b) * blend);

        const grad = ctx!.createRadialGradient(x, y, 0, x, y, Math.max(radX, radY));
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.18)`);
        grad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.08)`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx!.beginPath();
        ctx!.ellipse(x, y, radX, radY, 0, 0, Math.PI * 2);
        ctx!.fillStyle = grad;
        ctx!.fill();
      }

      animId = requestAnimationFrame(draw);
    }

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0"
      aria-hidden
    />
  );
}
