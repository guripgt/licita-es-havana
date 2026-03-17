import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate, UF_LIST, MODALITIES, STATUS_OPTIONS } from '@/lib/constants';
import { searchProcesses } from '@/lib/searchApi';
import type { NormalizedProcess, SearchFilters, SourceStatus } from '@/types/processes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Star, Eye, FolderPlus, ChevronDown, ChevronUp, X, AlertTriangle, Loader2, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const PAGE_SIZES = [50, 100, 200] as const;

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
  const [pageSize, setPageSize] = useState<number>(50);
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
    pageSize,
  }), [searchText, excludeText, modality, openDateStart, openDateEnd, closeDateStart, closeDateEnd, uf, city, agency, srp, minValue, maxValue, status, pageSize]);

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

    if (error) throw new Error('Erro ao salvar processo.');
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

  // Status badge helper
  const getStatusBadge = (process: NormalizedProcess) => {
    const today = new Date().toISOString().substring(0, 10);
    const statusText = process.status || '';
    const norm = statusText.toLowerCase();

    if (norm.includes('encerrad') || norm.includes('homologad') || norm.includes('revogad') || norm.includes('anulad')) {
      return { label: statusText || 'Encerrado', color: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' };
    }
    if (norm.includes('proposta') || norm.includes('aberto') || norm.includes('recebendo')) {
      return { label: statusText || 'Aberto', color: 'bg-emerald-500/10 text-emerald-700', dot: 'bg-emerald-500' };
    }
    if (process.closing_date && process.closing_date < today) {
      return { label: statusText || 'Encerrado', color: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' };
    }
    if (process.closing_date && process.closing_date >= today) {
      return { label: statusText || 'Aberto', color: 'bg-emerald-500/10 text-emerald-700', dot: 'bg-emerald-500' };
    }
    return { label: statusText || 'Em andamento', color: 'bg-warning/10 text-warning', dot: 'bg-warning' };
  };

  const sourceBadgeColor = (source: string) => {
    if (source === 'PNCP') return 'bg-blue-500/10 text-blue-600 border-blue-200';
    if (source === 'COMPRAS_GOV') return 'bg-green-500/10 text-green-600 border-green-200';
    return 'bg-muted text-muted-foreground';
  };

  const sourceStatusColor = (s: SourceStatus) => {
    if (s.status === 'ok') return 'bg-emerald-500/10 text-emerald-600';
    if (s.status === 'error') return 'bg-destructive/10 text-destructive';
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
      {/* Header */}
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

      {/* Source status badges */}
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

      {/* Filters */}
      {showFilters && (
        <div className="rounded-xl bg-card p-5 shadow-card space-y-5">
          {/* Row 1: Text search */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="searchText">Buscar no objeto</Label>
              <Input id="searchText" placeholder="Ex: material hospitalar, mobiliário..." value={searchText} onChange={e => setSearchText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="excludeText">Excluir termos</Label>
              <Input id="excludeText" placeholder="Ex: reforma, obra..." value={excludeText} onChange={e => setExcludeText(e.target.value)} />
            </div>
          </div>

          {/* Row 2: Category filters */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Modalidade</Label>
              <Select value={modality} onValueChange={setModality}>
                <SelectTrigger><SelectValue placeholder="Todas modalidades" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas modalidades</SelectItem>
                  {MODALITIES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>UF</Label>
              <Select value={uf} onValueChange={setUf}>
                <SelectTrigger><SelectValue placeholder="Todos estados" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos estados</SelectItem>
                  {UF_LIST.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Cidade</Label>
              <Input id="city" placeholder="Ex: São Paulo" value={city} onChange={e => setCity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agency">Órgão</Label>
              <Input id="agency" placeholder="Ex: Ministério da Saúde" value={agency} onChange={e => setAgency(e.target.value)} />
            </div>
          </div>

          {/* Row 3: Dates */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="openDateStart">Abertura (início)</Label>
              <Input id="openDateStart" type="date" value={openDateStart} onChange={e => setOpenDateStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="openDateEnd">Abertura (fim)</Label>
              <Input id="openDateEnd" type="date" value={openDateEnd} onChange={e => setOpenDateEnd(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="closeDateStart">Fechamento (início)</Label>
              <Input id="closeDateStart" type="date" value={closeDateStart} onChange={e => setCloseDateStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="closeDateEnd">Fechamento (fim)</Label>
              <Input id="closeDateEnd" type="date" value={closeDateEnd} onChange={e => setCloseDateEnd(e.target.value)} />
            </div>
          </div>

          {/* Row 4: Status, SRP, Values */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Situação</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue placeholder="Todas situações" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas situações</SelectItem>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>SRP</Label>
              <Select value={srp} onValueChange={setSrp}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minValue">Valor mínimo (R$)</Label>
              <Input id="minValue" type="number" placeholder="0,00" value={minValue} onChange={e => setMinValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxValue">Valor máximo (R$)</Label>
              <Input id="maxValue" type="number" placeholder="0,00" value={maxValue} onChange={e => setMaxValue(e.target.value)} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <Button onClick={handleSearch} size="sm">
              <Search className="mr-1.5 h-4 w-4" />
              Buscar
            </Button>
            <Button onClick={clearFilters} variant="ghost" size="sm">
              <X className="mr-1 h-3 w-3" />
              Limpar filtros
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Resultados por página:</Label>
              <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                <SelectTrigger className="h-8 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="rounded-xl bg-card shadow-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Consultando PNCP em tempo real...</p>
              <p className="text-xs text-muted-foreground">Isso pode levar alguns segundos</p>
            </div>
          </div>
        ) : processes.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Search className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              {!hasSearched
                ? 'Busque por palavra-chave ou aplique filtros para encontrar oportunidades.'
                : 'Nenhuma oportunidade encontrada com os filtros aplicados.'}
            </p>
            {hasSearched && (
              <p className="text-xs text-muted-foreground mt-1">Tente ampliar o período, mudar a modalidade ou remover filtros.</p>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: '1100px' }}>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-3" style={{ width: 40 }}></th>
                    <th className="px-3 py-3" style={{ width: 60 }}>Fonte</th>
                    <th className="px-3 py-3" style={{ width: 300, minWidth: 300 }}>Título</th>
                    <th className="px-3 py-3" style={{ width: 200, minWidth: 200 }}>Órgão</th>
                    <th className="px-3 py-3" style={{ width: 150, minWidth: 150 }}>Modalidade</th>
                    <th className="px-3 py-3" style={{ width: 50 }}>UF</th>
                    <th className="px-3 py-3" style={{ width: 50 }}>SRP</th>
                    <th className="px-3 py-3 text-right" style={{ width: 130 }}>Valor Estimado</th>
                    <th className="px-3 py-3" style={{ width: 100 }}>Abertura</th>
                    <th className="px-3 py-3" style={{ width: 100 }}>Fechamento</th>
                    <th className="px-3 py-3" style={{ width: 140 }}>Situação</th>
                    <th className="px-3 py-3" style={{ width: 80 }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {processes.map((p) => {
                    const badge = getStatusBadge(p);
                    return (
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
                        <td className="px-3 py-2.5" style={{ maxWidth: 300 }}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => viewDetail(p)}
                                className="block w-full truncate font-medium text-card-foreground hover:text-primary transition-colors text-left overflow-hidden text-ellipsis whitespace-nowrap"
                              >
                                {p.title}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-md">
                              <p className="text-xs">{p.title}</p>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="px-3 py-2.5" style={{ maxWidth: 200 }}>
                          <span className="block truncate text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">{p.agency}</span>
                        </td>
                        <td className="px-3 py-2.5" style={{ maxWidth: 150 }}>
                          <span className="block truncate text-muted-foreground text-xs overflow-hidden text-ellipsis whitespace-nowrap">{p.modality || '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{p.state || '—'}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{p.is_srp ? 'Sim' : p.is_srp === false ? 'Não' : '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-mono text-card-foreground whitespace-nowrap">{formatCurrency(p.estimated_value)}</td>
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(p.opening_date)}</td>
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(p.closing_date)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${badge.color}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                            {badge.label || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => viewDetail(p)}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Ver detalhes</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveToFunnel(p)}>
                                  <FolderPlus className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Salvar no funil</TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer with count + load more */}
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{processes.length}</span> resultado{processes.length !== 1 ? 's' : ''} exibido{processes.length !== 1 ? 's' : ''}
                {totalRecords > processes.length && (
                  <span> de <span className="font-semibold text-foreground">~{totalRecords.toLocaleString('pt-BR')}</span> encontrados</span>
                )}
              </p>
              {totalRecords > processes.length && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={handleLoadMore}
                >
                  {loadingMore ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Carregar mais
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SearchProcesses;
