/* 199b — every match card is tinted with its opponent's colour, so a week of
   them looks like a week of different people rather than one card repeated.

   The colour is derived from the name shown on the card, not from a user id:
   in doubles the opponent is two people and there is no single id to hash,
   while the label ("Ami/Beni") is exactly as stable. The same opponent
   therefore always brings the same colour. */

const PALETTE = [
  "165, 75, 196",
  "46, 74, 120",
  "196, 87, 63",
  "47, 138, 110",
  "184, 134, 43",
  "91, 95, 199",
  "196, 63, 120",
  "63, 138, 196",
];

export function tintFor(name) {
  const text = (name || "").trim();
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 100000;
  }
  return PALETTE[hash % PALETTE.length];
}
