import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(userId.trim(), password);
      navigate("/");
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={wrap}>
      <form onSubmit={handleLogin} style={card}>
        <h2>{t("title.login")}</h2>

        <input
          autoComplete="username"
          onChange={(event) => setUserId(event.target.value)}
          placeholder="ID"
          style={input}
          value={userId}
        />
        <input
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          style={input}
          type="password"
          value={password}
        />

        {error && <div style={errorBox}>{error}</div>}

        <button disabled={loading} style={{ ...btn, opacity: loading ? 0.65 : 1 }} type="submit">
          {loading ? "Signing in..." : t("title.loginbtn")}
        </button>
      </form>
    </div>
  );
}

const wrap = {
  height: "100vh",
  display: "grid",
  placeItems: "center",
  background: "#0b0f14",
};

const card = {
  width: 360,
  padding: 24,
  borderRadius: 16,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#fff",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const input = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "#111",
  color: "#fff",
};

const btn = {
  marginTop: 8,
  padding: 10,
  borderRadius: 8,
  background: "#00ffb4",
  border: "none",
  fontWeight: 700,
  cursor: "pointer",
};

const errorBox = {
  padding: 10,
  borderRadius: 8,
  background: "rgba(239,68,68,0.16)",
  border: "1px solid rgba(239,68,68,0.45)",
  color: "#fecaca",
  fontSize: 13,
};
