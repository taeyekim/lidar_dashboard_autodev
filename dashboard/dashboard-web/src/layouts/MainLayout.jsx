// 좌측 사이드바, 메인콘텐츠 영역
import { NavLink, Outlet } from "react-router-dom";
import "./mainLayout.css";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";



export default function MainLayout() {
  const { t } = useLanguage();
  const { logout, user } = useAuth();

  return (
    <div className="ml-root">
      <div className="ml-shell">
        <aside className="ml-sidebar">
          <div className="ml-brand">
            <div className="ml-title">{t("title.trafficside")}</div>
            <div className="ml-sub">{t("title.trafficsub")}</div>
          </div>

          <nav className="ml-nav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
              {t("nav.overview")}
            </NavLink>
            <NavLink to="/events" end className={({ isActive }) => (isActive ? "active" : "")}>
              {t("nav.events")} 
            </NavLink>
            <NavLink to="/devices" end className={({ isActive }) => (isActive ? "active" : "")}>
              {t("nav.devices")}
            </NavLink>
            <NavLink to="/settings" end className={({ isActive }) => (isActive ? "active" : "")}>
              {t("nav.settings")}
            </NavLink>
          </nav>

          <div className="ml-session">
            <div>
              <div className="ml-session-name">{user?.name || "Operator"}</div>
              <div className="ml-session-role">{user?.role || "AUTHENTICATED"}</div>
            </div>
            <button className="ml-logout" onClick={logout} type="button">
              Logout
            </button>
          </div>
        </aside>

        <main className="ml-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
