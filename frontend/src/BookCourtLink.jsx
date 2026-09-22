import { BOOKING_URL } from "./booking.js";

/* The way out to Lazuz, which has to be built differently depending on where
   the app is running.

   Inside an installed iOS web app, a link with target="_blank" opens a view
   that never finishes loading and then dismisses itself — a long-standing
   iOS standalone bug, and exactly what Omer saw. A plain link is what works
   there: iOS sees an address outside the app's scope, hands it to Safari (or
   to Lazuz's own app, if they publish universal links) and leaves the app
   running behind it.

   Everywhere else — a browser tab, Android, desktop — target="_blank" is the
   right thing, because a plain link really would navigate the app away. */

function isIosStandalone() {
  // navigator.standalone is iOS-only and true only for a home-screen app.
  return typeof navigator !== "undefined" && navigator.standalone === true;
}

export default function BookCourtLink({ className, children }) {
  const standalone = isIosStandalone();
  return (
    <a
      className={className}
      href={BOOKING_URL}
      {...(standalone ? {} : { target: "_blank", rel: "noopener noreferrer" })}
    >
      {children}
    </a>
  );
}
