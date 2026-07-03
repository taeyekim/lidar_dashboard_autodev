import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import RequireAuth from "../features/auth/RequireAuth";

const LoginPage = lazy(() => import("../pages/Login/LoginPage"));
const DashboardPage = lazy(() => import("../pages/Dashboard/DashboardPage"));
const WrongwayLogPage = lazy(() => import("../pages/Dashboard/WrongwayLogPage"));
const EventLogPage = lazy(() => import("../pages/EventLog/EventLogPage"));
const DevicesPage = lazy(() => import("../pages/Devices/DevicesPage"));
const SettingsPage = lazy(() => import("../pages/Settings/SettingsPage"));
const MainLayout = lazy(() => import("../layouts/MainLayout"));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white text-sm font-bold text-gray-500">
      화면을 불러오는 중입니다.
    </div>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            element={
              <RequireAuth>
                <MainLayout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/dashboard/wrongway" element={<WrongwayLogPage />} />
            <Route path="/events" element={<EventLogPage />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
