const PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default function Avatar({ name, size = 28, color }) {
  const initial = name?.trim()?.[0]?.toUpperCase() || "?";
  const base = color || colorForName(name || "");

  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: `color-mix(in oklch, ${base} 16%, transparent)`,
        borderColor: `color-mix(in oklch, ${base} 85%, transparent)`,
        color: `color-mix(in oklch, ${base} 55%, white)`,
      }}
    >
      {initial}
    </span>
  );
}
