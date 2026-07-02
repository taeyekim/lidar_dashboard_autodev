/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchCurrentOperator, loginOperator, logoutOperator } from "../features/auth/authApi";
import { getAuthToken, setAuthToken } from "../shared/api/http";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getAuthToken());
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    let ignore = false;

    const bootstrap = async () => {
      if (!token) {
        setIsAuthReady(true);
        return;
      }

      try {
        const response = await fetchCurrentOperator();
        if (!ignore) setUser(response.user || null);
      } catch {
        setAuthToken(null);
        if (!ignore) {
          setToken(null);
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
  }, [token]);

  const login = useCallback(async (userId, password) => {
    const response = await loginOperator(userId, password);
    setAuthToken(response.token);
    setToken(response.token);
    setUser(response.user || null);
    setIsAuthReady(true);
    return response.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) await logoutOperator();
    } catch {
      // Local logout still proceeds if the server token is already invalid.
    } finally {
      setAuthToken(null);
      setToken(null);
      setUser(null);
      setIsAuthReady(true);
    }
  }, [token]);

  const value = useMemo(
    () => ({
      isLoggedIn: Boolean(token),
      isAuthReady,
      token,
      user,
      login,
      logout,
    }),
    [isAuthReady, login, logout, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
