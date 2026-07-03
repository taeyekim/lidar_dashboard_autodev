/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchCurrentOperator, loginOperator, logoutOperator } from "../features/auth/authApi";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    let ignore = false;

    const bootstrap = async () => {
      try {
        const response = await fetchCurrentOperator();
        if (!ignore) setUser(response.user || null);
      } catch {
        if (!ignore) {
          setUser(null);
        }
      } finally {
        if (!ignore) setIsAuthReady(true);
      }
    };

    bootstrap();
    return () => {
      ignore = true;
    };
  }, []);

  const login = useCallback(async (userId, password) => {
    const response = await loginOperator(userId, password);
    setUser(response.user || null);
    setIsAuthReady(true);
    return response.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutOperator();
    } catch {
      // Local logout still proceeds if the server token is already invalid.
    } finally {
      setUser(null);
      setIsAuthReady(true);
    }
  }, []);

  const value = useMemo(
    () => ({
      isLoggedIn: Boolean(user),
      isAuthReady,
      user,
      login,
      logout,
    }),
    [isAuthReady, login, logout, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
