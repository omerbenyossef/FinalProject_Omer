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

export function CalendarIcon(props) {
  return (
    <svg {...common} {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="8" y1="3" x2="8" y2="6.5" />
      <line x1="16" y1="3" x2="16" y2="6.5" />
    </svg>
  );
}

export function ShareIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.5" />
    </svg>
  );
}

export function CloseIcon(props) {
  return (
    <svg {...common} {...props}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export function RankingIcon(props) {
  return (
    <svg {...common} {...props}>
      <line x1="6" y1="20" x2="6" y2="13" />
      <line x1="12" y1="20" x2="12" y2="9" />
      <line x1="18" y1="20" x2="18" y2="4" />
    </svg>
  );
}

export function BellIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M6 17h12l-1.5-2.5V10a4.5 4.5 0 0 0-9 0v4.5L6 17z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
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
