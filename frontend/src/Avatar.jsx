export default function Avatar({
  name,
  size = 28,
  dim = false,
  icon = null,
  background,
  color,
  fontFamily,
  fontSize,
}) {
  const initial = name?.trim()?.[0]?.toUpperCase() || "?";
  const sizeStyle = { width: size, height: size, fontSize: fontSize ?? Math.round(size * 0.42) };
  const fontStyle = fontFamily ? { fontFamily } : {};

  const style = dim
    ? {
        ...sizeStyle,
        background: "#161c25",
        borderColor: "rgba(148, 163, 184, .26)",
        borderStyle: "dashed",
        color: "#69728a",
        ...fontStyle,
      }
    : {
        ...sizeStyle,
        background: background ?? "#1d2938",
        borderColor: "transparent",
        color: color ?? "#c9cfdb",
        ...fontStyle,
      };

  return (
    <span className="avatar" style={style}>
      {icon ?? initial}
    </span>
  );
}
