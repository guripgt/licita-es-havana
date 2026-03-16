import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate, formatDateTime, FUNNEL_STAGES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Star, ExternalLink, FolderPlus, FileText } from 'lucide-react';
import { toast } from 'sonner';

const ProcessDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [process, setProcess] = useState<any>(null);
  const [savedProcess, setSavedProcess] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [linkedDocs, setLinkedDocs] = useState<any[]>([]);
  const [companyDocs, setCompanyDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: proc } = await supabase.from('public_processes').select('*').eq('id', id!).single();
      setProcess(proc);
      if (profile?.company_id) {
        const { data: sp } = await supabase.from('saved_processes').select('*').eq('company_id', profile.company_id).eq('public_process_id', id!).maybeSingle();
        setSavedProcess(sp);
        setNotes(sp?.notes || '');
        if (sp) {
          const { data: pd } = await supabase.from('process_documents').select('*, company_documents(*)').eq('saved_process_id', sp.id);
          setLinkedDocs(pd || []);
        }
        const { data: cd } = await supabase.from('company_documents').select('*').eq('company_id', profile.company_id);
        setCompanyDocs(cd || []);
      }
      setLoading(false);
    };
    load();
  }, [id, profile?.company_id]);

  const saveOrUpdate = async (stage?: string) => {
    if (!profile?.company_id) { toast.error('Configure sua empresa.'); return; }
    if (savedProcess) {
      await supabase.from('saved_processes').update({ notes, ...(stage ? { funnel_stage: stage } : {}) }).eq('id', savedProcess.id);
      setSavedProcess({ ...savedProcess, notes, ...(stage ? { funnel_stage: stage } : {}) });
    } else {
      const { data } = await supabase.from('saved_processes').insert({ company_id: profile.company_id, public_process_id: id!, notes, funnel_stage: stage || 'Encontrado' }).select().single();
      setSavedProcess(data);
    }
    toast.success('Salvo!');
  };

  const toggleFavorite = async () => {
    if (!savedProcess) await saveOrUpdate();
    const sp = savedProcess || (await supabase.from('saved_processes').select('*').eq('company_id', profile!.company_id!).eq('public_process_id', id!).single()).data;
    if (!sp) return;
    await supabase.from('saved_processes').update({ is_favorite: !sp.is_favorite }).eq('id', sp.id);
    setSavedProcess({ ...sp, is_favorite: !sp.is_favorite });
    toast.success(sp.is_favorite ? 'Removido dos favoritos' : 'Adicionado aos favoritos');
  };

  const linkDocument = async (docId: string) => {
    if (!savedProcess) { toast.error('Salve o processo primeiro.'); return; }
    await supabase.from('process_documents').insert({ saved_process_id: savedProcess.id, company_document_id: docId });
    const { data } = await supabase.from('process_documents').select('*, company_documents(*)').eq('saved_process_id', savedProcess.id);
    setLinkedDocs(data || []);
    toast.success('Documento vinculado!');
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (!process) return <p className="py-20 text-center text-muted-foreground">Processo não encontrado.</p>;

  const fields = [
    { label: 'Órgão', value: process.agency },
    { label: 'Esfera', value: process.government_level },
    { label: 'Modalidade', value: process.modality },
    { label: 'Valor Estimado', value: formatCurrency(process.estimated_value) },
    { label: 'SRP', value: process.is_srp ? 'Sim' : 'Não' },
    { label: 'UF', value: process.state },
    { label: 'Cidade', value: process.city },
    { label: 'Publicação', value: formatDate(process.publication_date) },
    { label: 'Abertura', value: formatDate(process.opening_date) },
    { label: 'Fechamento', value: formatDateTime(process.closing_date) },
    { label: 'Situação', value: process.status },
    { label: 'Portal', value: process.source_portal },
  ];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1 text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl bg-card p-6 shadow-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{process.modality}</span>
                <h1 className="mt-1 text-xl font-bold text-card-foreground">{process.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{process.agency} • {process.city}/{process.state}</p>
              </div>
              <button onClick={toggleFavorite} className="shrink-0 text-muted-foreground hover:text-warning transition-colors">
                <Star className={`h-5 w-5 ${savedProcess?.is_favorite ? 'fill-warning text-warning' : ''}`} />
              </button>
            </div>

            {process.object_description && (
              <div className="mt-4 rounded-lg bg-muted/50 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Objeto</p>
                <p className="text-sm text-card-foreground leading-relaxed">{process.object_description}</p>
              </div>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map(f => (
                <div key={f.label}>
                  <p className="text-xs text-muted-foreground">{f.label}</p>
                  <p className="text-sm font-medium text-card-foreground">{f.value || '—'}</p>
                </div>
              ))}
            </div>

            {process.external_url && (
              <a href={process.external_url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir no portal
              </a>
            )}
          </div>

          <div className="rounded-xl bg-card p-6 shadow-card">
            <h2 className="text-sm font-semibold text-card-foreground mb-3">Observações Internas</h2>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Adicione suas notas sobre este processo..." rows={4} />
            <Button size="sm" className="mt-3" onClick={() => saveOrUpdate()}>Salvar observações</Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl bg-card p-5 shadow-card space-y-4">
            <h2 className="text-sm font-semibold text-card-foreground">Ações</h2>
            {savedProcess && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Etapa atual</p>
                <p className="text-sm font-medium text-card-foreground">{savedProcess.funnel_stage}</p>
              </div>
            )}
            <Select onValueChange={stage => saveOrUpdate(stage)} value={savedProcess?.funnel_stage || ''}>
              <SelectTrigger><SelectValue placeholder="Mover para etapa..." /></SelectTrigger>
              <SelectContent>
                {FUNNEL_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {!savedProcess && (
              <Button className="w-full gap-1" onClick={() => saveOrUpdate('Encontrado')}>
                <FolderPlus className="h-4 w-4" /> Salvar no funil
              </Button>
            )}
          </div>

          <div className="rounded-xl bg-card p-5 shadow-card space-y-3">
            <h2 className="text-sm font-semibold text-card-foreground">Documentos Vinculados</h2>
            {linkedDocs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum documento vinculado.</p>
            ) : (
              <div className="space-y-2">
                {linkedDocs.map((ld: any) => (
                  <div key={ld.id} className="flex items-center gap-2 text-sm">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate text-card-foreground">{ld.company_documents?.name}</span>
                  </div>
                ))}
              </div>
            )}
            {savedProcess && companyDocs.length > 0 && (
              <Select onValueChange={linkDocument}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="Anexar documento..." /></SelectTrigger>
                <SelectContent>
                  {companyDocs.filter(d => !linkedDocs.some((ld: any) => ld.company_document_id === d.id)).map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProcessDetail;
