export default function Toggle({ checked, onChange, disabled, label, locked, className = "" }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle-switch${checked ? " on" : ""}${locked ? " locked" : ""}${className ? ` ${className}` : ""}`}
      onClick={() => onChange(!checked)}
      disabled={disabled || locked}
    >
      <span className="toggle-knob" />
    </button>
  );
}
