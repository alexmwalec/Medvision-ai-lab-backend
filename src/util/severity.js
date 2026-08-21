function scoreToColor(score) {
  if (score >= 0.7) return "#EF4444"; // red — high confidence
  if (score >= 0.4) return "#F59E0B"; // amber — moderate confidence
  return "#10B981"; // green — low confidence
}

module.exports = { scoreToColor };