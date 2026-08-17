export default function Avatar({ name, size = 28, dim = false, icon = null }) {
  const initial = name?.trim()?.[0]?.toUpperCase() || "?";

  const style = dim
    ? {
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: "#161c25",
        borderColor: "rgba(148, 163, 184, .26)",
        borderStyle: "dashed",
        color: "#69728a",
      }
    : {
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: "#1d2938",
        borderColor: "transparent",
        color: "#c9cfdb",
      };

  return (
    <span className="avatar" style={style}>
      {icon ?? initial}
    </span>
  );
}
