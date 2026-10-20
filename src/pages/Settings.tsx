import { useEffect, useRef, useState } from 'react';
import { exportBackup, getSettings, importBackup, saveSettings, type Settings } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Building2, User, Bell, Download, Upload, DatabaseBackup } from 'lucide-react';

export const SETTINGS_UPDATED_EVENT = 'settings-updated';

const SettingsPage = () => {
  const [settings, setSettings] = useState<Settings>({ full_name: '', company_name: '', cnpj: '', email: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSettings().then(setSettings).catch(err => toast.error('Erro ao ler configurações: ' + err.message)).finally(() => setLoading(false));
  }, []);

  const set = (field: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings(prev => ({ ...prev, [field]: e.target.value }));

  const save = async (message: string) => {
    setSaving(true);
    try {
      await saveSettings(settings);
      window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));
      toast.success(message);
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    const blob = await exportBackup();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `licitacoes-backup-${new Date().toISOString().substring(0, 10)}.json`;
    a.click();
    // Safari/Firefox cancelam o download se o link for revogado logo após o clique
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast.success('Backup exportado!');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm('Importar este backup vai substituir todos os dados atuais deste navegador. Continuar?')) return;
    setImporting(true);
    try {
      const result = await importBackup(file);
      setSettings(await getSettings());
      window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));
      toast.success(`Backup importado: ${result.processes} processo(s) e ${result.documents} documento(s).`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar backup');
    } finally {
      setImporting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu perfil, empresa e backup</p>
      </div>

      <div className="rounded-xl bg-card p-6 shadow-card space-y-4">
        <div className="flex items-center gap-2 text-card-foreground">
          <User className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Perfil</h2>
        </div>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Nome completo</Label>
            <Input value={settings.full_name} onChange={set('full_name')} />
          </div>
          <Button size="sm" onClick={() => save('Perfil atualizado!')} disabled={saving}>Salvar perfil</Button>
        </div>
      </div>

      <div className="rounded-xl bg-card p-6 shadow-card space-y-4">
        <div className="flex items-center gap-2 text-card-foreground">
          <Building2 className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Dados da Empresa</h2>
        </div>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Nome da empresa</Label>
            <Input value={settings.company_name} onChange={set('company_name')} placeholder="Nome da empresa" />
          </div>
          <div className="space-y-2">
            <Label>CNPJ</Label>
            <Input value={settings.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0001-00" />
          </div>
          <div className="space-y-2">
            <Label>Email principal</Label>
            <Input value={settings.email} onChange={set('email')} placeholder="contato@empresa.com" />
          </div>
          <Button size="sm" onClick={() => save('Empresa atualizada!')} disabled={saving}>Salvar empresa</Button>
        </div>
      </div>

      <div className="rounded-xl bg-card p-6 shadow-card space-y-4">
        <div className="flex items-center gap-2 text-card-foreground">
          <DatabaseBackup className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Backup</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Seus dados ficam salvos apenas neste navegador. Exporte um backup regularmente.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5">
            <Download className="h-4 w-4" /> Exportar backup
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing} className="gap-1.5">
            <Upload className="h-4 w-4" /> {importing ? 'Importando...' : 'Importar backup'}
          </Button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
        </div>
      </div>

      <div className="rounded-xl bg-card p-6 shadow-card space-y-4">
        <div className="flex items-center gap-2 text-card-foreground">
          <Bell className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Notificações</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Em breve: notificações por email e WhatsApp para novas licitações e vencimentos de documentos.
        </p>
      </div>
    </div>
  );
};

export default SettingsPage;
