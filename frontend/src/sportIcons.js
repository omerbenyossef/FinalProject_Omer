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
