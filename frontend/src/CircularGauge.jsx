function polarToCartesian(cx, cy, r, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  if (endAngle - startAngle >= 359.99) {
    const start = polarToCartesian(cx, cy, r, startAngle);
    const mid = polarToCartesian(cx, cy, r, startAngle + 180);
    return `M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${mid.x} ${mid.y} A ${r} ${r} 0 1 1 ${start.x} ${start.y}`;
  }
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

export default function CircularGauge({ value, max, size = 104, strokeWidth = 10, children }) {
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const tickWidth = strokeWidth * 0.3;
  const tickDash = `${strokeWidth * 0.38} ${strokeWidth * 0.3}`;
  const trackArc = describeArc(cx, cy, radius, 0, 360);
  const fillArc = pct > 0 ? describeArc(cx, cy, radius, 0, pct * 360) : null;

  return (
    <div className="gauge-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <path d={trackArc} fill="none" stroke="var(--card-alt)" strokeWidth={strokeWidth} strokeLinecap="round" />
        <path
          d={trackArc}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={tickWidth}
          strokeLinecap="round"
          strokeDasharray={tickDash}
        />
        {fillArc && (
          <>
            <path d={fillArc} fill="none" stroke="var(--court)" strokeWidth={strokeWidth} strokeLinecap="round" />
            <path
              d={fillArc}
              fill="none"
              stroke="rgba(0, 0, 0, 0.45)"
              strokeWidth={tickWidth}
              strokeLinecap="round"
              strokeDasharray={tickDash}
              style={{ mixBlendMode: "multiply" }}
            />
          </>
        )}
      </svg>
      <div className="gauge-center">{children}</div>
    </div>
  );
}
