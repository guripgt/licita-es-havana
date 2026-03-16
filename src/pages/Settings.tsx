import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Building2, User, Bell } from 'lucide-react';

const SettingsPage = () => {
  const { profile, user } = useAuth();
  const [company, setCompany] = useState<any>(null);
  const [companyName, setCompanyName] = useState('');
  const [companyCnpj, setCompanyCnpj] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingCompany, setCreatingCompany] = useState(false);

  useEffect(() => {
    const load = async () => {
      setFullName(profile?.full_name || '');
      if (profile?.company_id) {
        const { data } = await supabase.from('companies').select('*').eq('id', profile.company_id).single();
        if (data) {
          setCompany(data);
          setCompanyName(data.name);
          setCompanyCnpj(data.cnpj);
          setCompanyEmail(data.email || '');
        }
      }
      setLoading(false);
    };
    load();
  }, [profile]);

  const saveProfile = async () => {
    setSaving(true);
    await supabase.from('profiles').update({ full_name: fullName }).eq('id', user!.id);
    toast.success('Perfil atualizado!');
    setSaving(false);
  };

  const saveCompany = async () => {
    if (!company) return;
    setSaving(true);
    await supabase.from('companies').update({ name: companyName, email: companyEmail }).eq('id', company.id);
    toast.success('Empresa atualizada!');
    setSaving(false);
  };

  const createCompany = async () => {
    if (!companyName || !companyCnpj) { toast.error('Preencha nome e CNPJ.'); return; }
    setCreatingCompany(true);
    const { data, error } = await supabase.from('companies').insert({ name: companyName, cnpj: companyCnpj, email: companyEmail }).select().single();
    if (error) { toast.error('Erro: ' + error.message); setCreatingCompany(false); return; }
    await supabase.from('profiles').update({ company_id: data.id }).eq('id', user!.id);
    setCompany(data);
    toast.success('Empresa criada e vinculada!');
    setCreatingCompany(false);
    window.location.reload();
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie sua conta e empresa</p>
      </div>

      <div className="rounded-xl bg-card p-6 shadow-card space-y-4">
        <div className="flex items-center gap-2 text-card-foreground">
          <User className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Perfil</h2>
        </div>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Nome completo</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email || ''} disabled className="bg-muted" />
          </div>
          <Button size="sm" onClick={saveProfile} disabled={saving}>Salvar perfil</Button>
        </div>
      </div>

      <div className="rounded-xl bg-card p-6 shadow-card space-y-4">
        <div className="flex items-center gap-2 text-card-foreground">
          <Building2 className="h-4 w-4" />
          <h2 className="text-sm font-semibold">{company ? 'Dados da Empresa' : 'Criar Empresa'}</h2>
        </div>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Nome da empresa</Label>
            <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Nome da empresa" />
          </div>
          <div className="space-y-2">
            <Label>CNPJ</Label>
            <Input value={companyCnpj} onChange={e => setCompanyCnpj(e.target.value)} placeholder="00.000.000/0001-00" disabled={!!company} className={company ? 'bg-muted' : ''} />
          </div>
          <div className="space-y-2">
            <Label>Email principal</Label>
            <Input value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} placeholder="contato@empresa.com" />
          </div>
          {company ? (
            <Button size="sm" onClick={saveCompany} disabled={saving}>Salvar empresa</Button>
          ) : (
            <Button size="sm" onClick={createCompany} disabled={creatingCompany}>
              {creatingCompany ? 'Criando...' : 'Criar e vincular empresa'}
            </Button>
          )}
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
