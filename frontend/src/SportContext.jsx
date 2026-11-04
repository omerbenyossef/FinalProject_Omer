import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { sportSlug } from "./sportTheme.js";

const STORAGE_KEY = "rally-selected-sport";
const SportContext = createContext(null);

export function SportProvider({ children }) {
  const [sports, setSports] = useState([]);
  const [selectedSportId, setSelectedSportIdState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : null;
  });

  useEffect(() => {
    api.listSports().then((sportsData) => {
      setSports(sportsData);
      setSelectedSportIdState((current) =>
        current && sportsData.some((s) => s.id === current) ? current : sportsData[0]?.id ?? null
      );
    });
  }, []);

  function setSelectedSportId(id) {
    setSelectedSportIdState(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  }

  const selectedSport = sports.find((s) => s.id === selectedSportId) ?? null;
  const slug = sportSlug(selectedSport);

  // 187c change 2: the whole app re-themes to the sport. One attribute on the
  // root element, because the accent is a CSS token (`--court`) that hundreds
  // of rules already read — re-pointing it is cheaper and safer than teaching
  // each of them about the sport.
  useEffect(() => {
    document.documentElement.dataset.sport = slug;
  }, [slug]);

  return (
    <SportContext.Provider
      value={{ sports, selectedSportId, setSelectedSportId, selectedSport, sportSlug: slug }}
    >
      {children}
    </SportContext.Provider>
  );
}

export function useSport() {
  return useContext(SportContext);
}
