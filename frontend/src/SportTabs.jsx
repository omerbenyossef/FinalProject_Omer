export default function SportTabs({ sports, selected, onSelect }) {
  if (!sports.length) return null;

  return (
    <div className="sport-tabs">
      {sports.map((sport) => (
        <button
          key={sport.id}
          type="button"
          className={`sport-tab${selected === sport.id ? " active" : ""}`}
          onClick={() => onSelect(sport.id)}
        >
          {sport.name}
        </button>
      ))}
    </div>
  );
}
