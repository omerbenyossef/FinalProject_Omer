import { useState } from "react";
import { mediaUrl } from "./api";
import BookCourtLink from "./BookCourtLink.jsx";

/* One venue, as a card with a way to check its hours before committing to it.
   Lived inside ProposeSchedule until the open-games screen needed the same
   card — a second copy would have been a second place for "check the hours
   first" to drift out of. */

export default function VenueCard({ venue, selected, onChoose, t }) {
  const [broken, setBroken] = useState(false);
  const showImage = !!venue.image_url && !broken;
  const strip = (
    <div className="vc-strip">
      {showImage ? (
        <img
          src={mediaUrl(venue.image_url)}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="vc-initials" dir="auto">
          {(venue.name || "").trim().slice(0, 2)}
        </span>
      )}
    </div>
  );
  const choose = (
    <button type="button" className={`vc-choose${selected ? " on" : ""}`} onClick={onChoose}>
      {t("בחר")}
    </button>
  );
  return (
    <div className={`vc${selected ? " on" : ""}`}>
      {strip}
      {venue.booking_url ? (
        <div className="vc-body">
          <span className="vc-name" dir="auto">
            {venue.name}
          </span>
          <div className="vc-actions">
            {/* Looking only. Checking three venues before finding a free slot
                must not commit you to the first one you opened. */}
            <BookCourtLink className="vc-hours" url={venue.booking_url}>
              {t("בדוק שעות")} ↗
            </BookCourtLink>
            {choose}
          </div>
        </div>
      ) : (
        <div className="vc-body is-row">
          <span className="vc-body-main">
            <span className="vc-name" dir="auto">
              {venue.name}
            </span>
            <span className="vc-nobooking">{t("בלי הזמנה אונליין")}</span>
          </span>
          {choose}
        </div>
      )}
    </div>
  );
}
