export function SkeletonBar({ width = "100%", height = 14, style }) {
  return <span className="skeleton-bar" style={{ width, height, ...style }} />;
}

export function SkeletonCircle({ size = 96 }) {
  return <span className="skeleton-bar skeleton-circle" style={{ width: size, height: size }} />;
}

export function SkeletonPageHeader() {
  return (
    <div className="page-header">
      <div>
        <SkeletonBar width={160} height={26} />
        <SkeletonBar width={100} height={14} style={{ marginTop: 8 }} />
      </div>
      <SkeletonBar width={90} height={36} style={{ borderRadius: 10 }} />
    </div>
  );
}

export function SkeletonHeroStat() {
  return (
    <div className="hero-stat">
      <SkeletonCircle size={104} />
      <div className="hero-copy">
        <SkeletonBar width={80} height={12} />
        <SkeletonBar width="90%" height={14} style={{ marginTop: 10 }} />
        <div className="chip-row" style={{ marginTop: 10 }}>
          <SkeletonBar width={70} height={26} style={{ borderRadius: 999 }} />
          <SkeletonBar width={70} height={26} style={{ borderRadius: 999 }} />
        </div>
      </div>
    </div>
  );
}

export function SkeletonStatRow() {
  return (
    <div className="stat-row">
      <div className="stat-tile">
        <SkeletonBar width={36} height={22} style={{ margin: "0 auto" }} />
        <SkeletonBar width={50} height={12} style={{ marginTop: 8, marginInline: "auto" }} />
      </div>
      <div className="stat-tile">
        <SkeletonBar width={36} height={22} style={{ margin: "0 auto" }} />
        <SkeletonBar width={50} height={12} style={{ marginTop: 8, marginInline: "auto" }} />
      </div>
      <div className="stat-tile">
        <SkeletonBar width={36} height={22} style={{ margin: "0 auto" }} />
        <SkeletonBar width={50} height={12} style={{ marginTop: 8, marginInline: "auto" }} />
      </div>
    </div>
  );
}

export function SkeletonMatchRow() {
  return (
    <li className="match-row">
      <SkeletonBar width="50%" height={16} />
      <SkeletonBar width={70} height={22} style={{ marginTop: 8 }} />
    </li>
  );
}

export function SkeletonLeagueCard() {
  return (
    <div className="card league-card">
      <SkeletonBar width="70%" height={18} />
      <SkeletonBar width="45%" height={13} style={{ marginTop: 10 }} />
    </div>
  );
}

export function SkeletonStandingsTable({ rows = 4 }) {
  return (
    <div className="table-wrap">
      <table className="standings-table">
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              <td>
                <SkeletonCircle size={24} />
              </td>
              <td className="player-col">
                <SkeletonBar width="60%" height={14} />
              </td>
              <td>
                <SkeletonBar width={20} height={14} />
              </td>
              <td>
                <SkeletonBar width={20} height={14} />
              </td>
              <td>
                <SkeletonBar width={20} height={14} />
              </td>
              <td>
                <SkeletonBar width={20} height={14} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
