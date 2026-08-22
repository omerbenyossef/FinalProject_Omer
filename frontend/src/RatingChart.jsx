// homeformandratingchart125a.md section 4 — draws the continuous
// PlayerRating.level over the last N months (already aggregated to one
// point per month by the /ratings/history endpoint). Caller is responsible
// for not rendering this with fewer than 3 samples (two points aren't a
// line).
const MONTH_ABBR = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function monthLabel(monthKey) {
  const m = Number(monthKey.split("-")[1]);
  return MONTH_ABBR[m - 1] || monthKey;
}

const PLOT_X0 = 38;
const PLOT_X1 = 345;
const PLOT_Y_TOP = 10;
const PLOT_Y_BASE = 94;
const LABEL_Y = 112;

export default function RatingChart({ samples }) {
  const values = samples.map((s) => s.level);
  let lo = Math.floor(Math.min(...values) * 2) / 2;
  let hi = Math.ceil(Math.max(...values) * 2) / 2;
  if (hi - lo < 1.5) {
    const mid = (lo + hi) / 2;
    lo = Math.max(1.5, Math.round((mid - 0.75) * 2) / 2);
    hi = lo + 1.5;
  }
  const y = (v) => PLOT_Y_BASE - ((v - lo) / (hi - lo)) * (PLOT_Y_BASE - PLOT_Y_TOP);
  const n = samples.length;
  const x = (i) => (n === 1 ? PLOT_X0 : PLOT_X0 + (i * (PLOT_X1 - PLOT_X0)) / (n - 1));

  const points = samples.map((s, i) => `${x(i)},${y(s.level)}`).join(" ");
  const areaPoints = `${points} ${PLOT_X1},${PLOT_Y_BASE} ${PLOT_X0},${PLOT_Y_BASE}`;

  const gridValues = [lo, lo + 0.5, lo + 1.0, hi];
  const midIdx = Math.floor((n - 1) / 2);
  const lastIdx = n - 1;

  return (
    <svg viewBox="0 0 353 118" role="img" aria-hidden="true">
      {gridValues.map((v) => (
        <line
          key={v}
          className="home-chart-grid"
          x1={PLOT_X0}
          x2={PLOT_X1}
          y1={y(v)}
          y2={y(v)}
          stroke={v === lo ? "#2b323d" : "#212a34"}
        />
      ))}
      {gridValues.map((v) => (
        <text key={v} className="home-chart-axis-y" x={0} y={y(v) + 3}>
          {v.toFixed(1)}
        </text>
      ))}
      <polygon points={areaPoints} fill="#c6f24e" fillOpacity=".07" />
      <polyline
        points={points}
        stroke="#c6f24e"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx={x(lastIdx)} cy={y(values[lastIdx])} r="5" fill="#c6f24e" />
      <text className="home-chart-axis-x" x={PLOT_X0} y={LABEL_Y} textAnchor="start">
        {monthLabel(samples[0].month)}
      </text>
      <text className="home-chart-axis-x" x={(PLOT_X0 + PLOT_X1) / 2} y={LABEL_Y} textAnchor="middle">
        {monthLabel(samples[midIdx].month)}
      </text>
      <text className="home-chart-axis-x home-chart-axis-now" x={PLOT_X1} y={LABEL_Y} textAnchor="end">
        NOW
      </text>
    </svg>
  );
}
