import { Routes, Route, NavLink } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import LeadsPage     from "./pages/LeadsPage";
import ContentPage   from "./pages/ContentPage";

const nav = [
  { to: "/",        label: "Dashboard" },
  { to: "/leads",   label: "Leads" },
  { to: "/content", label: "Content" },
];

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <span className="text-accent font-bold text-lg tracking-tight">Prophives</span>
          <p className="text-muted text-xs mt-0.5">Lead Ops</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-gray-400 hover:text-gray-100 hover:bg-white/5"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-border text-xs text-muted">
          support@prophives.com
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/"        element={<DashboardPage />} />
          <Route path="/leads"   element={<LeadsPage />} />
          <Route path="/content" element={<ContentPage />} />
        </Routes>
      </main>
    </div>
  );
}
