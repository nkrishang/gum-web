"use client";

import * as React from "react";
import { encode } from "uqr";

/**
 * A QR code drawn as one SVG path: round data dots, rounded finder squares, and a clear square in
 * the middle for the token's mark. Error correction is Q (25%), and the cleared square covers
 * about 5% of the modules, so the code keeps a wide margin for glare and cheap cameras.
 */
export function QrCode({
  value,
  size = 216,
  logo,
  label,
}: {
  value: string;
  size?: number;
  logo?: string | null;
  label: string;
}) {
  const { path, finders, n, hole } = React.useMemo(() => {
    const qr = encode(value, { ecc: "Q", border: 0 });
    const n = qr.size;
    // An odd-sized hole, centred on a module boundary.
    let hole = logo ? Math.floor(n * 0.22) : 0;
    if (hole % 2 === 0) hole += 1;
    const lo = (n - hole) / 2;
    const hi = lo + hole;
    const inFinder = (x: number, y: number) =>
      (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    const r = 0.42;
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!qr.data[y][x] || inFinder(x, y)) continue;
        if (hole && x >= lo - 0.5 && x < hi && y >= lo - 0.5 && y < hi) continue;
        const cx = x + 0.5;
        const cy = y + 0.5;
        d += `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
      }
    }
    return { path: d, finders: [[0, 0], [n - 7, 0], [0, n - 7]] as const, n, hole };
  }, [value, logo]);

  const logoSize = hole * 0.78;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`-2 -2 ${n + 4} ${n + 4}`}
      width={size}
      height={size}
      className="block"
      shapeRendering="geometricPrecision"
    >
      <rect x={-2} y={-2} width={n + 4} height={n + 4} rx={2.4} fill="#ffffff" />
      <path d={path} fill="var(--pay-qr)" />
      {finders.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1.9} fill="none" stroke="var(--pay-qr)" strokeWidth={1} />
          <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.9} fill="var(--pay-qr)" />
        </g>
      ))}
      {logo && hole ? (
        <image
          href={logo}
          x={(n - logoSize) / 2}
          y={(n - logoSize) / 2}
          width={logoSize}
          height={logoSize}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : null}
    </svg>
  );
}
