import { createContext, useContext, useEffect, useState } from "react";
import { translate } from "./translations.js";
import { api } from "./api";
import { useAuth } from "./AuthContext.jsx";

const STORAGE_KEY = "rally-language";
const LanguageContext = createContext(null);

function applyDocumentLanguage(language) {
  document.documentElement.lang = language === "en" ? "en" : "he";
  document.documentElement.dir = language === "en" ? "ltr" : "rtl";
}

export function LanguageProvider({ children }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState(() => localStorage.getItem(STORAGE_KEY) || "he");

  useEffect(() => {
    applyDocumentLanguage(language);
  }, [language]);

  // The screen reads its language from this browser; push notifications read
  // it from the account. They only ever met at the moment someone switched
  // language by hand, so an old switch — on any device, however long ago —
  // left the account saying "en" while the app in front of the reader was in
  // Hebrew, and their phone buzzed in English. Reconcile on every load: what
  // this player is actually reading is the truth, so the account follows it.
  useEffect(() => {
    if (!user || user.language === language) return;
    api.updateProfile({ language }).catch(() => {});
  }, [user, language]);

  function setLanguage(next) {
    localStorage.setItem(STORAGE_KEY, next);
    setLanguageState(next);
    // The server writes push notifications, so it has to know which language
    // this player reads. Best effort: a signed-out visitor has nothing to
    // save, and a failure here only affects the phone, not the app.
    if (localStorage.getItem("token")) {
      api.updateProfile({ language: next }).catch(() => {});
    }
  }

  function t(text, params) {
    let result = translate(text, language);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        result = result.replaceAll(`{${key}}`, value);
      }
    }
    return result;
  }

  const dir = language === "en" ? "ltr" : "rtl";

  return (
    <LanguageContext.Provider value={{ language, setLanguage, dir, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
