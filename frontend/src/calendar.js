// A one-event .ics, handed to the browser as a download. No library: the
// format is a dozen lines, and every date in it is UTC so no client has to
// agree with us about time zones.

function stamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// RFC 5545 wants CRLF, folds long lines, and escapes these four characters in
// text values. Calendar apps are forgiving about the folding and unforgiving
// about the escaping.
function escapeText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function matchCalendarFile({ title, start, durationMinutes, location, uid }) {
  const end = new Date(start.getTime() + (durationMinutes || 90) * 60000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rally//Match//HE",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${escapeText(uid)}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(title)}`,
    location ? `LOCATION:${escapeText(location)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

export function downloadCalendarFile(contents, filename) {
  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick, not immediately: Safari reads the blob after
  // the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
