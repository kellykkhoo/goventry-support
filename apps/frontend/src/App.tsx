// apps/frontend/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./lib/auth";
import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import TicketsPage from "./pages/TicketsPage";
import TicketDetailPage from "./pages/TicketDetailPage";
import AgenciesPage from "./pages/AgenciesPage";
import ApprovalQueuePage from "./pages/ApprovalQueuePage";
import KnowledgePage from "./pages/KnowledgePage";
import ReportsPage from "./pages/ReportsPage";
import HermesActivityPage from "./pages/HermesActivityPage";
import FeatureBacklogPage from "./pages/FeatureBacklogPage";
import FeatureRequestDetailPage from "./pages/FeatureRequestDetailPage";
import RoadmapPage from "./pages/RoadmapPage";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/tickets" replace />} />
              <Route path="tickets" element={<TicketsPage />} />
              <Route path="tickets/:id" element={<TicketDetailPage />} />
              <Route path="agencies" element={<AgenciesPage />} />
              <Route path="approvals" element={<ApprovalQueuePage />} />
              <Route path="knowledge" element={<KnowledgePage />} />
              <Route path="knowledge/guides" element={<KnowledgePage sourceType="doc" />} />
              <Route path="knowledge/tickets" element={<KnowledgePage sourceType="resolved_ticket" />} />
              <Route path="roadmap" element={<RoadmapPage />} />
              <Route path="roadmap/features" element={<FeatureBacklogPage />} />
              <Route path="roadmap/features/:id" element={<FeatureRequestDetailPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="hermes" element={<HermesActivityPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
