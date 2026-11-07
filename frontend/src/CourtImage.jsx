import { mediaUrl } from "./api";

/* 203b — the top of a match card is a picture of the place.

   A photograph when the venue has one. When it doesn't — which is most
   venues, and every match arranged as free text — the card draws a court
   instead of falling back to a grey rectangle: the screen's whole job in this
   redesign is to stop looking like a dashboard, and an empty band at the top
   of every card is exactly that.

   The drawn court is coloured by the surface, blue for hard and green for the
   softer ones, and an unknown surface takes the blue. That is a guess, but a
   court is one of the two colours and the field only ever decides which. */

const SURFACES = {
  hard: ["#2f6db5", "#2a5fa0"],
  clay: ["#2f8a5a", "#26744b"],
  grass: ["#2f8a5a", "#26744b"],
};

export default function CourtImage({ photoUrl, surface, height = 96, className = "", children }) {
  const [from, to] = SURFACES[surface] || SURFACES.hard;

  return (
    <div className={`court${className ? ` ${className}` : ""}`} style={{ height }}>
      {photoUrl ? (
        <img className="court-photo" src={mediaUrl(photoUrl)} alt="" />
      ) : (
        /* One viewBox, scaled to whatever height the card gives it: the lines
           stretch with it rather than being redrawn per size. */
        <svg
          className="court-draw"
          viewBox="0 0 200 96"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`court-${surface || "hard"}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={from} />
              <stop offset="1" stopColor={to} />
            </linearGradient>
          </defs>
          <rect width="200" height="96" fill={`url(#court-${surface || "hard"})`} />
          <g stroke="rgba(255,255,255,.55)" strokeWidth="1.4" fill="none">
            <rect x="26" y="16" width="148" height="64" />
            <line x1="100" y1="16" x2="100" y2="80" />
            <line x1="26" y1="48" x2="174" y2="48" strokeWidth="2.2" />
            <line x1="62" y1="16" x2="62" y2="80" strokeDasharray="3 4" />
            <line x1="138" y1="16" x2="138" y2="80" strokeDasharray="3 4" />
          </g>
        </svg>
      )}
      {/* The chip and the venue name sit on the picture, so whatever is
          underneath them is darkened enough to read against. */}
      <span className="court-veil" aria-hidden="true" />
      {children}
    </div>
  );
}
