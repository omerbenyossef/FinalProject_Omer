import { BOOKING_URL } from "./booking.js";

/* The way out to Lazuz.

   In a browser tab, on Android and on desktop, target="_blank" is right: a
   plain link would navigate the app itself away.

   Inside an installed iOS home-screen app it is left off. Not because
   target="_blank" was ever shown to be broken here — the hang we chased for a
   day turned out to be a bad URL — but because a plain link is what lets iOS
   hand the address to Lazuz's own app if they publish universal links, which
   would open it already signed in. */

function isIosStandalone() {
  // navigator.standalone is iOS-only and true only for a home-screen app.
  return typeof navigator !== "undefined" && navigator.standalone === true;
}

export default function BookCourtLink({ className, children, url }) {
  const standalone = isIosStandalone();
  // The venue agreed for this match, when there is one and it carries a
  // link. Otherwise the default — which is one hard-coded venue, and the
  // reason the venue list exists.
  const href = url || BOOKING_URL;
  return (
    <a
      className={className}
      href={href}
      {...(standalone ? {} : { target: "_blank", rel: "noopener noreferrer" })}
    >
      {children}
    </a>
  );
}
