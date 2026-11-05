import { useLayoutEffect, useRef, useState } from "react";

/* 199 — a menu that hangs from the button that opens it.
   Shared by the sport switcher and the pair switcher, which sit side by side
   in the header: two menus that opened differently from the same row would
   read as two different kinds of control.

   The measuring is done by hand because the topbar carries a backdrop-filter,
   and a filtered element becomes the containing block for its fixed-position
   descendants — a menu left next to its button was laid out inside a 56px
   bar, with everything below the first row off the screen. */

// Kept in step with .sportmenu in index.css: the width is needed here to keep
// the menu on the screen, and there to draw it.
export const MENU_WIDTH = 320;
export const MENU_MARGIN = 12;
const GAP = 8;

export function useDropdownAnchor(open, onClose) {
  const buttonRef = useRef(null);
  const [anchor, setAnchor] = useState(null);

  useLayoutEffect(() => {
    if (!open) return;
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) {
      const rtl = document.documentElement.dir === "rtl";
      const width = Math.min(MENU_WIDTH, window.innerWidth - MENU_MARGIN * 2);
      // Hung from the button's own edge, then pulled back inside the screen:
      // a button in the middle of the header leaves a menu 200px off the side.
      const raw = rtl ? window.innerWidth - r.right : r.left;
      const start = Math.min(
        Math.max(raw, MENU_MARGIN),
        window.innerWidth - width - MENU_MARGIN,
      );
      setAnchor({ top: Math.round(r.bottom + GAP), start: Math.round(start) });
    }
    // A scroll or a resize closes it rather than letting it drift away from
    // the button it belongs to.
    const close = () => onClose();
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return { buttonRef, anchor };
}
