import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

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

  return (
    <SportContext.Provider value={{ sports, selectedSportId, setSelectedSportId }}>
      {children}
    </SportContext.Provider>
  );
}

export function useSport() {
  return useContext(SportContext);
}
