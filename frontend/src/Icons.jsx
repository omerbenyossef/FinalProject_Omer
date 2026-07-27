const common = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function TrophyIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M8 3h8v4a4 4 0 0 1-8 0V3z" />
      <path d="M8 4H5a2 2 0 0 0 2 3" />
      <path d="M16 4h3a2 2 0 0 1-2 3" />
      <path d="M12 11v3.5" />
      <path d="M9.5 19h5" />
      <path d="M10.2 14.5h3.6l0.9 4.5H9.3l0.9-4.5z" />
    </svg>
  );
}

export function PersonIcon(props) {
  return (
    <svg {...common} {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5" />
    </svg>
  );
}

export function UserPlusIcon(props) {
  return (
    <svg {...common} {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-4 3-6.5 6.5-6.5s6.5 2.5 6.5 6.5" />
      <line x1="18" y1="8" x2="18" y2="14" />
      <line x1="15" y1="11" x2="21" y2="11" />
    </svg>
  );
}

export function SettingsIcon(props) {
  return (
    <svg {...common} {...props}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="15" cy="6" r="2" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="9" cy="12" r="2" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="16" cy="18" r="2" />
    </svg>
  );
}
