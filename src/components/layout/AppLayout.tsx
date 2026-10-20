import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { useEffect, useState } from 'react';
import { getSettings } from '@/lib/store';
import { SETTINGS_UPDATED_EVENT } from '@/pages/Settings';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState('');

  useEffect(() => {
    const load = () => getSettings().then(s => setName(s.full_name));
    load();
    window.addEventListener(SETTINGS_UPDATED_EVENT, load);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, load);
  }, []);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger className="text-muted-foreground" />
            <div className="ml-auto flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{name || 'Usuário'}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                {(name || 'U').charAt(0).toUpperCase()}
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
