import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import SearchProcesses from "./pages/SearchProcesses";
import ProcessDetail from "./pages/ProcessDetail";
import Funnel from "./pages/Funnel";
import Documents from "./pages/Documents";
import SettingsPage from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedPage = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute><AppLayout>{children}</AppLayout></ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedPage><Dashboard /></ProtectedPage>} />
            <Route path="/buscar" element={<ProtectedPage><SearchProcesses /></ProtectedPage>} />
            <Route path="/licitacao/:id" element={<ProtectedPage><ProcessDetail /></ProtectedPage>} />
            <Route path="/funil" element={<ProtectedPage><Funnel /></ProtectedPage>} />
            <Route path="/documentos" element={<ProtectedPage><Documents /></ProtectedPage>} />
            <Route path="/configuracoes" element={<ProtectedPage><SettingsPage /></ProtectedPage>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
