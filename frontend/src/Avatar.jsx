export default function Avatar({ name, size = 28 }) {
  const initial = name?.trim()?.[0]?.toUpperCase() || "?";

  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: "#1d2938",
        borderColor: "transparent",
        color: "#c9cfdb",
      }}
    >
      {initial}
    </span>
  );
}
