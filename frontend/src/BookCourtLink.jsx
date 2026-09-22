/* The way out to the venue's own booking site.

   In a browser tab, on Android and on desktop, target="_blank" is right: a
   plain link would navigate the app itself away.

   Inside an installed iOS home-screen app it is left off. Not because
   target="_blank" was ever shown to be broken here — the hang we chased for a
   day turned out to be a bad URL — but because a plain link is what lets iOS
   hand the address to the venue's own app if they publish universal links,
   which would open it already signed in. */

function isIosStandalone() {
  // navigator.standalone is iOS-only and true only for a home-screen app.
  return typeof navigator !== "undefined" && navigator.standalone === true;
}

export default function BookCourtLink({ className, children, url }) {
  // No link, no button. This used to fall back on one hard-coded address —
  // Hadar Yosef's padel complex — so a tennis player who had chosen no venue
  // was sent to the wrong sport entirely. Choosing no venue is an ordinary
  // thing to do, and the honest answer to it is to offer nothing.
  if (!url) return null;
  const standalone = isIosStandalone();
  return (
    <a
      className={className}
      href={url}
      {...(standalone ? {} : { target: "_blank", rel: "noopener noreferrer" })}
    >
      {children}
    </a>
  );
}
