export function formatSets(sets) {
  if (!sets || sets.length === 0) return "";
  return sets.map((s) => `${s.player1_games}:${s.player2_games}`).join(", ");
}
