import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate, UF_LIST, MODALITIES, STATUS_OPTIONS } from '@/lib/constants';
import { searchProcesses } from '@/lib/searchApi';
import type { NormalizedProcess, SearchFilters, SourceStatus } from '@/types/processes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Star, Eye, FolderPlus, ChevronDown, ChevronUp, X, AlertTriangle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const PAGE_SIZE = 20;

const SearchProcesses = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [processes, setProcesses] = useState<NormalizedProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [page, setPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [excludeText, setExcludeText] = useState('');
  const [modality, setModality] = useState('all');
  const [openDateStart, setOpenDateStart] = useState('');
  const [openDateEnd, setOpenDateEnd] = useState('');
  const [closeDateStart, setCloseDateStart] = useState('');
  const [closeDateEnd, setCloseDateEnd] = useState('');
  const [uf, setUf] = useState('all');
  const [city, setCity] = useState('');
  const [agency, setAgency] = useState('');
  const [srp, setSrp] = useState('all');
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
  const [status, setStatus] = useState('all');

  const buildFilters = useCallback((p: number): SearchFilters => ({
    searchText: searchText || undefined,
    excludeText: excludeText || undefined,
    modality: modality !== 'all' ? modality : undefined,
    openDateStart: openDateStart || undefined,
    openDateEnd: openDateEnd || undefined,
    closeDateStart: closeDateStart || undefined,
    closeDateEnd: closeDateEnd || undefined,
    uf: uf !== 'all' ? uf : undefined,
    city: city || undefined,
    agency: agency || undefined,
    srp: srp !== 'all' ? srp : undefined,
    minValue: minValue ? parseFloat(minValue) : undefined,
    maxValue: maxValue ? parseFloat(maxValue) : undefined,
    status: status !== 'all' ? status : undefined,
    page: p,
    pageSize: PAGE_SIZE,
  }), [searchText, excludeText, modality, openDateStart, openDateEnd, closeDateStart, closeDateEnd, uf, city, agency, srp, minValue, maxValue, status]);

  const fetchProcesses = useCallback(async (targetPage: number, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const filters = buildFilters(targetPage);
      const result = await searchProcesses(filters);
      setProcesses(prev => append ? [...prev, ...result.data] : result.data);
      setSources(result.sources);
      setDemoMode(result.demoMode);
      setTotalRecords(result.totalRecords);
      setHasSearched(true);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao buscar licitações');
      if (!append) setProcesses([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [buildFilters]);

  const loadFavorites = async () => {
    if (!profile?.company_id) return;
    const { data } = await supabase.from('saved_processes').select('public_process_id').eq('company_id', profile.company_id).eq('is_favorite', true);
    setFavorites(new Set((data || []).map((d: any) => d.public_process_id)));
  };

  useEffect(() => { loadFavorites(); }, [profile?.company_id]);

  const upsertPublicProcess = async (process: NormalizedProcess): Promise<string> => {
    const { data: existing } = await supabase
      .from('public_processes')
      .select('id')
      .eq('source', process.source)
      .eq('external_id', process.external_id)
      .maybeSingle();

    if (existing) return existing.id;

    const { data: inserted, error } = await supabase.from('public_processes').insert({
      external_id: process.external_id,
      source: process.source,
      title: process.title,
      object_description: process.object_description,
      agency: process.agency,
      government_level: process.government_level,
      modality: process.modality,
      estimated_value: process.estimated_value,
      is_srp: process.is_srp,
      state: process.state,
      city: process.city,
      publication_date: process.publication_date,
      opening_date: process.opening_date,
      closing_date: process.closing_date,
      status: process.status,
      source_portal: process.source_portal,
      external_url: process.external_url,
    }).select('id').single();

    if (error) {
      console.error('Error inserting public process:', error);
      throw new Error('Erro ao salvar processo.');
    }
    return inserted.id;
  };

  const toggleFavorite = async (process: NormalizedProcess) => {
    if (!profile?.company_id) { toast.error('Configure sua empresa primeiro.'); return; }
    try {
      const dbId = await upsertPublicProcess(process);
      const isFav = favorites.has(dbId);
      if (isFav) {
        await supabase.from('saved_processes').delete().eq('company_id', profile.company_id).eq('public_process_id', dbId).eq('is_favorite', true);
        setFavorites(prev => { const n = new Set(prev); n.delete(dbId); return n; });
      } else {
        const { data: existing } = await supabase.from('saved_processes').select('id').eq('company_id', profile.company_id).eq('public_process_id', dbId).maybeSingle();
        if (existing) {
          await supabase.from('saved_processes').update({ is_favorite: true }).eq('id', existing.id);
        } else {
          await supabase.from('saved_processes').insert({ company_id: profile.company_id, public_process_id: dbId, is_favorite: true });
        }
        setFavorites(prev => new Set(prev).add(dbId));
      }
      toast.success(isFav ? 'Removido dos favoritos' : 'Adicionado aos favoritos');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao favoritar');
    }
  };

  const saveToFunnel = async (process: NormalizedProcess) => {
    if (!profile?.company_id) { toast.error('Configure sua empresa primeiro.'); return; }
    try {
      const dbId = await upsertPublicProcess(process);
      const { data: existing } = await supabase.from('saved_processes').select('id').eq('company_id', profile.company_id).eq('public_process_id', dbId).maybeSingle();
      if (existing) { toast.info('Processo já está no funil.'); return; }
      await supabase.from('saved_processes').insert({ company_id: profile.company_id, public_process_id: dbId, funnel_stage: 'Encontrado' });
      toast.success('Processo salvo no funil!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar no funil');
    }
  };

  const viewDetail = (process: NormalizedProcess) => {
    // Store in sessionStorage so detail page can load without DB lookup
    sessionStorage.setItem(`process_${process.source}_${process.external_id}`, JSON.stringify(process));
    navigate(`/licitacao/${process.source}/${encodeURIComponent(process.external_id)}`);
  };

  const clearFilters = () => {
    setSearchText(''); setExcludeText(''); setModality('all'); setOpenDateStart(''); setOpenDateEnd('');
    setCloseDateStart(''); setCloseDateEnd(''); setUf('all'); setCity(''); setAgency('');
    setSrp('all'); setMinValue(''); setMaxValue(''); setStatus('all');
  };

  const handleSearch = () => {
    setPage(1);
    fetchProcesses(1);
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchProcesses(nextPage, true);
  };

  const sourceBadgeColor = (source: string) => {
    if (source === 'PNCP') return 'bg-blue-500/10 text-blue-600 border-blue-200';
    if (source === 'COMPRAS_GOV') return 'bg-green-500/10 text-green-600 border-green-200';
    return 'bg-muted text-muted-foreground';
  };

  const sourceStatusColor = (s: SourceStatus) => {
    if (s.status === 'ok') return 'bg-emerald-500/10 text-emerald-600';
    if (s.status === 'error') return 'bg-destructive/10 text-destructive';
    if (s.status === 'disabled') return 'bg-muted text-muted-foreground';
    return 'bg-muted text-muted-foreground';
  };

  const sourceStatusLabel = (s: SourceStatus) => {
    if (s.status === 'ok') return 'Conectado';
    if (s.status === 'error') return 'Erro';
    if (s.status === 'disabled') return 'Desabilitado';
    return 'Sem resultados';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Buscar Licitações</h1>
          <p className="text-sm text-muted-foreground">Fonte principal: PNCP • Busca em tempo real</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
          Filtros
        </Button>
      </div>

      {/* Source status */}
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {demoMode && (
            <div className="flex items-center gap-1.5 rounded-lg bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              Modo demonstração — APIs externas indisponíveis
            </div>
          )}
          {sources.map((s, i) => (
            <div key={i} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${sourceStatusColor(s)}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${
                s.status === 'ok' ? 'bg-emerald-500' :
                s.status === 'error' ? 'bg-destructive' : 'bg-muted-foreground'
              }`} />
              {s.name}: {sourceStatusLabel(s)}
              {s.message && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle className="h-3 w-3 cursor-help opacity-70" />
                  </TooltipTrigger>
                  <TooltipContent><p className="max-w-xs text-xs">{s.message}</p></TooltipContent>
                </Tooltip>
              )}
            </div>
          ))}
        </div>
      )}

      {showFilters && (
        <div className="rounded-xl bg-card p-5 shadow-card space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input placeholder="Buscar no objeto..." value={searchText} onChange={e => setSearchText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
            <Input placeholder="Excluir termos..." value={excludeText} onChange={e => setExcludeText(e.target.value)} />
            <Select value={modality} onValueChange={setModality}>
              <SelectTrigger><SelectValue placeholder="Modalidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas modalidades</SelectItem>
                {MODALITIES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos estados</SelectItem>
                {UF_LIST.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Cidade" value={city} onChange={e => setCity(e.target.value)} />
            <Input placeholder="Órgão" value={agency} onChange={e => setAgency(e.target.value)} />
            <Select value={srp} onValueChange={setSrp}>
              <SelectTrigger><SelectValue placeholder="SRP" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Situação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas situações</SelectItem>
                {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" placeholder="Abertura início" value={openDateStart} onChange={e => setOpenDateStart(e.target.value)} />
            <Input type="date" placeholder="Abertura fim" value={openDateEnd} onChange={e => setOpenDateEnd(e.target.value)} />
            <Input type="number" placeholder="Valor mínimo" value={minValue} onChange={e => setMinValue(e.target.value)} />
            <Input type="number" placeholder="Valor máximo" value={maxValue} onChange={e => setMaxValue(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSearch} size="sm">Buscar</Button>
            <Button onClick={clearFilters} variant="ghost" size="sm"><X className="mr-1 h-3 w-3" />Limpar</Button>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-card shadow-card overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Consultando PNCP...</p>
            </div>
          </div>
        ) : processes.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {!hasSearched
                ? 'Clique em "Buscar" para consultar licitações em tempo real.'
                : 'Nenhuma licitação encontrada com os filtros aplicados. Tente ajustar os filtros ou ampliar o período.'}
            </p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 w-10"></th>
                  <th className="px-3 py-3 w-16">Fonte</th>
                  <th className="px-3 py-3">Título</th>
                  <th className="px-3 py-3">Órgão</th>
                  <th className="px-3 py-3">Modalidade</th>
                  <th className="px-3 py-3">UF</th>
                  <th className="px-3 py-3">SRP</th>
                  <th className="px-3 py-3 text-right">Valor Estimado</th>
                  <th className="px-3 py-3">Abertura</th>
                  <th className="px-3 py-3">Fechamento</th>
                  <th className="px-3 py-3">Situação</th>
                  <th className="px-3 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {processes.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5">
                      <button onClick={() => toggleFavorite(p)} className="text-muted-foreground hover:text-warning transition-colors">
                        <Star className={`h-4 w-4 ${favorites.has(p.id) ? 'fill-warning text-warning' : ''}`} />
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${sourceBadgeColor(p.source)}`}>
                        {p.source === 'PNCP' ? 'PNCP' : 'CG'}
                      </span>
                    </td>
                    <td className="max-w-[220px] px-3 py-2.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={() => viewDetail(p)} className="block truncate font-medium text-card-foreground hover:text-primary transition-colors text-left">
                            {p.title}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-md">
                          <p className="text-xs">{p.title}</p>
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-muted-foreground">{p.agency}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{p.modality}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{p.state}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{p.is_srp ? 'Sim' : p.is_srp === false ? 'Não' : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-mono text-card-foreground">{formatCurrency(p.estimated_value)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(p.opening_date)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(p.closing_date)}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-info/10 text-info">
                        <span className="h-1.5 w-1.5 rounded-full bg-info" />
                        {p.status || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => viewDetail(p)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveToFunnel(p)}>
                          <FolderPlus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Load more + count */}
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {processes.length} resultado{processes.length !== 1 ? 's' : ''} exibido{processes.length !== 1 ? 's' : ''}
                {totalRecords > processes.length && ` (de ~${totalRecords.toLocaleString('pt-BR')} encontrados)`}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={loadingMore}
                onClick={handleLoadMore}
              >
                {loadingMore ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Carregar mais
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SearchProcesses;
