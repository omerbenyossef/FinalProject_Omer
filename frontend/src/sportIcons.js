import {
  TennisIcon,
  PadelIcon,
  FootballIcon,
  BasketballIcon,
  VolleyballIcon,
  ChessIcon,
  TrophyIcon,
} from "./Icons.jsx";

const SPORT_ICONS = {
  טניס: TennisIcon,
  פאדל: PadelIcon,
  כדורגל: FootballIcon,
  כדורסל: BasketballIcon,
  כדורעף: VolleyballIcon,
  שחמט: ChessIcon,
};

export function getSportIcon(name) {
  return SPORT_ICONS[name] || TrophyIcon;
}

const SPORT_COLORS = {
  טניס: "#d9be74",
  פאדל: "#22abbb",
  כדורגל: "#22c55e",
  כדורסל: "#f97316",
  כדורעף: "#3b82f6",
  שחמט: "#8b5cf6",
};

export function getSportColor(name) {
  return SPORT_COLORS[name] || "#c6f135";
}
