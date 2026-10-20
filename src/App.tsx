import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import SearchProcesses from "./pages/SearchProcesses";
import ProcessDetail from "./pages/ProcessDetail";
import Funnel from "./pages/Funnel";
import Favorites from "./pages/Favorites";
import Documents from "./pages/Documents";
import SettingsPage from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const Page = ({ children }: { children: React.ReactNode }) => (
  <AppLayout>{children}</AppLayout>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <Routes>
          <Route path="/" element={<Page><Dashboard /></Page>} />
          <Route path="/buscar" element={<Page><SearchProcesses /></Page>} />
          <Route path="/licitacao/:source/:externalId" element={<Page><ProcessDetail /></Page>} />
          <Route path="/favoritos" element={<Page><Favorites /></Page>} />
          <Route path="/funil" element={<Page><Funnel /></Page>} />
          <Route path="/documentos" element={<Page><Documents /></Page>} />
          <Route path="/configuracoes" element={<Page><SettingsPage /></Page>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
