import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formatCurrency, formatDate, formatDateTime, FUNNEL_STAGES } from '@/lib/constants';
import { getProcess, listDocuments, processKey, saveProcess, type CompanyDocument, type SavedProcess } from '@/lib/store';
import type { NormalizedProcess } from '@/types/processes';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Star, ExternalLink, FolderPlus, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { RemoveFromFunnelButton } from '@/components/RemoveFromFunnelButton';

const ProcessDetail = () => {
  const { source, externalId } = useParams<{ source: string; externalId: string }>();
  const navigate = useNavigate();
  const [process, setProcess] = useState<NormalizedProcess | null>(null);
  const [savedProcess, setSavedProcess] = useState<SavedProcess | null>(null);
  const [notes, setNotes] = useState('');
  const [companyDocs, setCompanyDocs] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // react-router já entrega o parâmetro decodificado
      const decodedExternalId = externalId || '';
      let proc: NormalizedProcess | null = null;
      let saved: SavedProcess | null = null;
      let docs: CompanyDocument[] = [];

      try {
        if (source && decodedExternalId) {
          saved = (await getProcess(processKey({ source, external_id: decodedExternalId }))) ?? null;
        }
        docs = await listDocuments();
      } catch (err) {
        console.error('Erro ao ler dados locais:', err);
      }
      if (saved) {
        proc = saved;
      } else if (source && decodedExternalId) {
        const cached = sessionStorage.getItem(`process_${source}_${decodedExternalId}`);
        if (cached) {
          try { proc = JSON.parse(cached); } catch { proc = null; }
        }
      }

      setProcess(proc);
      setSavedProcess(saved);
      setNotes(saved?.notes || '');
      setCompanyDocs(docs);
      setLoading(false);
    };
    load();
  }, [source, externalId]);

  const update = async (patch: Parameters<typeof saveProcess>[1], message: string) => {
    if (!process) return;
    try {
      const saved = await saveProcess(process, patch);
      setSavedProcess(saved.in_funnel || saved.is_favorite ? saved : null);
      toast.success(message);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    }
  };

  const saveOrUpdate = (stage?: string) =>
    update({ in_funnel: true, notes, ...(stage ? { funnel_stage: stage } : {}) }, 'Salvo!');

  const toggleFavorite = () => {
    const isFav = !!savedProcess?.is_favorite;
    return update({ is_favorite: !isFav }, isFav ? 'Removido dos favoritos' : 'Adicionado aos favoritos');
  };

  const linkDocument = (docId: string) =>
    update({ in_funnel: true, linked_doc_ids: [...(savedProcess?.linked_doc_ids || []), docId] }, 'Documento vinculado!');

  const linkedIds = savedProcess?.linked_doc_ids || [];
  const linkedDocs = companyDocs.filter(d => linkedIds.includes(d.id));
  const isExternal = !savedProcess;

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!process) return (
    <div className="py-20 text-center space-y-4">
      <p className="text-muted-foreground">Processo não encontrado.</p>
      <Button variant="outline" onClick={() => navigate('/buscar')}>Voltar à busca</Button>
    </div>
  );

  const sourceBadge = process.source === 'PNCP' 
    ? { label: 'PNCP', className: 'bg-blue-500/10 text-blue-600 border-blue-200' }
    : process.source === 'COMPRAS_GOV'
    ? { label: 'Compras.gov', className: 'bg-green-500/10 text-green-600 border-green-200' }
    : null;

  const fields = [
    { label: 'Órgão', value: process.agency },
    { label: 'Esfera', value: process.government_level },
    { label: 'Modalidade', value: process.modality },
    { label: 'Valor Estimado', value: formatCurrency(process.estimated_value) },
    ...(process.homologated_value != null ? [{ label: 'Valor Homologado', value: formatCurrency(process.homologated_value) }] : []),
    { label: 'SRP', value: process.is_srp === true ? 'Sim' : process.is_srp === false ? 'Não' : '—' },
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
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{process.modality}</span>
                  {sourceBadge && (
                    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${sourceBadge.className}`}>
                      {sourceBadge.label}
                    </span>
                  )}
                  {isExternal && (
                    <span className="inline-flex items-center rounded-md bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                      Não salvo
                    </span>
                  )}
                </div>
                <h1 className="mt-1 text-xl font-bold text-card-foreground">{process.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{process.agency}{process.city ? ` • ${process.city}` : ''}{process.state ? `/${process.state}` : ''}</p>
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
            {savedProcess?.in_funnel && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Etapa atual</p>
                <p className="text-sm font-medium text-card-foreground">{savedProcess.funnel_stage}</p>
              </div>
            )}
            <Select onValueChange={stage => saveOrUpdate(stage)} value={savedProcess?.in_funnel ? savedProcess.funnel_stage : ''}>
              <SelectTrigger><SelectValue placeholder="Mover para etapa..." /></SelectTrigger>
              <SelectContent>
                {FUNNEL_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {!savedProcess?.in_funnel && (
              <Button className="w-full gap-1" onClick={() => saveOrUpdate('Encontrado')}>
                <FolderPlus className="h-4 w-4" /> Salvar no funil
              </Button>
            )}
            {savedProcess?.in_funnel && (
              <RemoveFromFunnelButton
                variant="button"
                process={savedProcess}
                onRemoved={updated => {
                  setSavedProcess(updated.is_favorite ? updated : null);
                  if (!updated.is_favorite) setNotes('');
                }}
              />
            )}
          </div>

          <div className="rounded-xl bg-card p-5 shadow-card space-y-3">
            <h2 className="text-sm font-semibold text-card-foreground">Documentos Vinculados</h2>
            {linkedDocs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum documento vinculado.</p>
            ) : (
              <div className="space-y-2">
                {linkedDocs.map(ld => (
                  <div key={ld.id} className="flex items-center gap-2 text-sm">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate text-card-foreground">{ld.name}</span>
                  </div>
                ))}
              </div>
            )}
            {companyDocs.length > linkedDocs.length && (
              <Select value="" onValueChange={linkDocument}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="Anexar documento..." /></SelectTrigger>
                <SelectContent>
                  {companyDocs.filter(d => !linkedIds.includes(d.id)).map(d => (
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
