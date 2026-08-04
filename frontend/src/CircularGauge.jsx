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

export default function CircularGauge({
  value,
  max,
  size = 104,
  strokeWidth = 10,
  children,
  trackColor = "var(--card-alt)",
  tickColor = "var(--muted)",
  fillColor = "var(--court)",
}) {
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const tickWidth = strokeWidth * 0.18;
  const tickDash = `${strokeWidth * 0.4} ${strokeWidth * 0.75}`;
  const trackArc = describeArc(cx, cy, radius, 0, 360);
  const fillArc = pct > 0 ? describeArc(cx, cy, radius, 0, pct * 360) : null;

  return (
    <div className="gauge-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <path d={trackArc} fill="none" stroke={trackColor} strokeWidth={strokeWidth} strokeLinecap="round" />
        <path
          d={trackArc}
          fill="none"
          stroke={tickColor}
          strokeWidth={tickWidth}
          strokeLinecap="butt"
          strokeDasharray={tickDash}
        />
        {fillArc && (
          <>
            <path d={fillArc} fill="none" stroke={fillColor} strokeWidth={strokeWidth} strokeLinecap="round" />
            <path
              d={fillArc}
              fill="none"
              stroke="rgba(0, 0, 0, 0.45)"
              strokeWidth={tickWidth}
              strokeLinecap="butt"
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
