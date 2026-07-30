import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }

    // The backend can take a while to wake up (free-tier cold start), so
    // don't leave the user staring at a loading screen forever: fall back
    // to the logged-out state after a timeout, and still log them in if
    // the slow response eventually comes back.
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      setLoading(false);
    }, 8000);

    api
      .me()
      .then((userData) => {
        setUser(userData);
      })
      .catch(() => {
        if (!timedOut) localStorage.removeItem("token");
      })
      .finally(() => {
        clearTimeout(timeout);
        setLoading(false);
      });
  }, []);

  function loginWithToken(token, userData) {
    localStorage.setItem("token", token);
    setUser(userData);
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginWithToken, logout, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
