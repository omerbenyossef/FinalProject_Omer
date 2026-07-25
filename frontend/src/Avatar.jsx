const AVATAR_COLORS = ["#0e8f52", "#b9812a", "#3b6ea5", "#8a4fb0", "#c1573a", "#3f8f8f"];

function colorFor(seed) {
  const str = String(seed);
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function Avatar({ name, id, size = 26 }) {
  const initial = name?.trim()?.[0]?.toUpperCase() || "?";
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: colorFor(id ?? name ?? "?"),
      }}
    >
      {initial}
    </span>
  );
}
