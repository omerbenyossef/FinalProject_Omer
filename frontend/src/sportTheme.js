/* Which sport a screen is showing, as a theme.
   187c change 2: the accent colour belongs to the sport, not to the app. The
   token itself is `--court` — it was named for the tennis court it came from
   and is already wired through every button, link, active tab and action dot,
   so the sport repoints it rather than a second token shadowing it.
   The slug is also what `:root[data-sport]` keys on, and what picks the icon. */

export const SPORT_SLUGS = {
  טניס: "tennis",
  פאדל: "padel",
  כדורגל: "football",
  כדורסל: "basketball",
  כדורעף: "volleyball",
  שחמט: "chess",
};

export function sportSlug(sport) {
  if (!sport) return "tennis";
  return SPORT_SLUGS[(sport.name || "").trim()] || "tennis";
}
