import { useRef, useState } from "react";
import { api } from "./api";
import { useAuth } from "./AuthContext.jsx";
import { useLanguage } from "./LanguageContext.jsx";
import Avatar from "./Avatar.jsx";

const SIDE = 320;

// A phone camera photo is several megabytes and far larger than a 76px circle
// needs, so it gets cropped to a square and drawn down to SIDE before it ever
// leaves the device — what gets uploaded is tens of kilobytes.
function toSquareJpeg(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("לא הצלחנו לקרוא את הקובץ"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("הקובץ הזה אינו תמונה"));
      image.onload = () => {
        const side = Math.min(image.width, image.height);
        const canvas = document.createElement("canvas");
        canvas.width = SIDE;
        canvas.height = SIDE;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(
          image,
          (image.width - side) / 2,
          (image.height - side) / 2,
          side,
          side,
          0,
          0,
          SIDE,
          SIDE
        );
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function PhotoPicker({ size = 76 }) {
  const { user, updateUser } = useAuth();
  const { t } = useLanguage();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    // Let the same file be picked again after a failure.
    e.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      updateUser(await api.setMyPhoto(await toSquareJpeg(file)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setError("");
    setBusy(true);
    try {
      updateUser(await api.deleteMyPhoto());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pp-photo">
      <button
        type="button"
        className="pp-photo-btn"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={user?.photo_url ? t("החלפת תמונה") : t("הוספת תמונה")}
      >
        <Avatar name={user?.name} photoUrl={user?.photo_url} size={size} />
        <span className="pp-photo-badge" aria-hidden="true">
          {user?.photo_url ? "↻" : "+"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="pp-photo-input"
        onChange={handleFile}
      />
      <div className="pp-photo-side">
        <span className="pp-photo-hint">
          {busy
            ? t("מעלה...")
            : user?.photo_url
              ? t("התמונה שלך")
              : t("הוסף תמונה כדי שיזהו אותך")}
        </span>
        {user?.photo_url && !busy && (
          <button type="button" className="pp-photo-remove" onClick={handleRemove}>
            {t("הסרת התמונה")}
          </button>
        )}
        {error && <span className="pp-photo-error">{t(error)}</span>}
      </div>
    </div>
  );
}
