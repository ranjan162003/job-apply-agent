import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
import { ProviderConnectionsProvider } from "./context/ProviderConnectionsContext";
import { ToastProvider } from "./context/ToastContext";
import { AgentConnectorsPage } from "./pages/AgentConnectorsPage";
import { ExtensionPage } from "./pages/ExtensionPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ResumesPage } from "./pages/ResumesPage";

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <ProviderConnectionsProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<ProfilePage />} />
              <Route path="/resumes" element={<ResumesPage />} />
              <Route path="/extension" element={<ExtensionPage />} />
              <Route path="/connectors" element={<AgentConnectorsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ProviderConnectionsProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
