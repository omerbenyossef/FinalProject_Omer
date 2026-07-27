import { createContext, useContext, useEffect, useState } from "react";
import { translate } from "./translations.js";

const STORAGE_KEY = "rally-language";
const LanguageContext = createContext(null);

function applyDocumentLanguage(language) {
  document.documentElement.lang = language === "en" ? "en" : "he";
  document.documentElement.dir = language === "en" ? "ltr" : "rtl";
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => localStorage.getItem(STORAGE_KEY) || "he");

  useEffect(() => {
    applyDocumentLanguage(language);
  }, [language]);

  function setLanguage(next) {
    localStorage.setItem(STORAGE_KEY, next);
    setLanguageState(next);
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
