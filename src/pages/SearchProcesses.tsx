import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate, UF_LIST, MODALITIES, STATUS_OPTIONS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Star, Eye, FolderPlus, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const SearchProcesses = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [processes, setProcesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

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

  const fetchProcesses = async () => {
    setLoading(true);
    let query = supabase.from('public_processes').select('*').order('closing_date', { ascending: true });

    if (searchText) query = query.ilike('title', `%${searchText}%`);
    if (excludeText) query = query.not('title', 'ilike', `%${excludeText}%`);
    if (modality !== 'all') query = query.eq('modality', modality);
    if (openDateStart) query = query.gte('opening_date', openDateStart);
    if (openDateEnd) query = query.lte('opening_date', openDateEnd);
    if (closeDateStart) query = query.gte('closing_date', closeDateStart);
    if (closeDateEnd) query = query.lte('closing_date', closeDateEnd);
    if (uf !== 'all') query = query.eq('state', uf);
    if (city) query = query.ilike('city', `%${city}%`);
    if (agency) query = query.ilike('agency', `%${agency}%`);
    if (srp === 'sim') query = query.eq('is_srp', true);
    if (srp === 'nao') query = query.eq('is_srp', false);
    if (minValue) query = query.gte('estimated_value', parseFloat(minValue));
    if (maxValue) query = query.lte('estimated_value', parseFloat(maxValue));
    if (status !== 'all') query = query.eq('status', status);

    const { data } = await query;
    setProcesses(data || []);
    setLoading(false);
  };

  const loadFavorites = async () => {
    if (!profile?.company_id) return;
    const { data } = await supabase.from('saved_processes').select('public_process_id').eq('company_id', profile.company_id).eq('is_favorite', true);
    setFavorites(new Set((data || []).map((d: any) => d.public_process_id)));
  };

  useEffect(() => { fetchProcesses(); loadFavorites(); }, [profile?.company_id]);

  const toggleFavorite = async (processId: string) => {
    if (!profile?.company_id) { toast.error('Configure sua empresa primeiro.'); return; }
    const isFav = favorites.has(processId);
    if (isFav) {
      await supabase.from('saved_processes').delete().eq('company_id', profile.company_id).eq('public_process_id', processId).eq('is_favorite', true);
      setFavorites(prev => { const n = new Set(prev); n.delete(processId); return n; });
    } else {
      const { data: existing } = await supabase.from('saved_processes').select('id').eq('company_id', profile.company_id).eq('public_process_id', processId).maybeSingle();
      if (existing) {
        await supabase.from('saved_processes').update({ is_favorite: true }).eq('id', existing.id);
      } else {
        await supabase.from('saved_processes').insert({ company_id: profile.company_id, public_process_id: processId, is_favorite: true });
      }
      setFavorites(prev => new Set(prev).add(processId));
    }
    toast.success(isFav ? 'Removido dos favoritos' : 'Adicionado aos favoritos');
  };

  const saveToFunnel = async (processId: string) => {
    if (!profile?.company_id) { toast.error('Configure sua empresa primeiro.'); return; }
    const { data: existing } = await supabase.from('saved_processes').select('id').eq('company_id', profile.company_id).eq('public_process_id', processId).maybeSingle();
    if (existing) { toast.info('Processo já está no funil.'); return; }
    await supabase.from('saved_processes').insert({ company_id: profile.company_id, public_process_id: processId, funnel_stage: 'Encontrado' });
    toast.success('Processo salvo no funil!');
  };

  const clearFilters = () => {
    setSearchText(''); setExcludeText(''); setModality('all'); setOpenDateStart(''); setOpenDateEnd('');
    setCloseDateStart(''); setCloseDateEnd(''); setUf('all'); setCity(''); setAgency('');
    setSrp('all'); setMinValue(''); setMaxValue(''); setStatus('all');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Buscar Licitações</h1>
          <p className="text-sm text-muted-foreground">Encontre oportunidades de licitação</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
          Filtros
        </Button>
      </div>

      {showFilters && (
        <div className="rounded-xl bg-card p-5 shadow-card space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input placeholder="Buscar no objeto..." value={searchText} onChange={e => setSearchText(e.target.value)} />
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
            <Button onClick={fetchProcesses} size="sm">Buscar</Button>
            <Button onClick={clearFilters} variant="ghost" size="sm"><X className="mr-1 h-3 w-3" />Limpar</Button>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-card shadow-card overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
        ) : processes.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhuma licitação encontrada.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-3 w-10"></th>
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
                    <button onClick={() => toggleFavorite(p.id)} className="text-muted-foreground hover:text-warning transition-colors">
                      <Star className={`h-4 w-4 ${favorites.has(p.id) ? 'fill-warning text-warning' : ''}`} />
                    </button>
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2.5 font-medium text-card-foreground">{p.title}</td>
                  <td className="max-w-[160px] truncate px-3 py-2.5 text-muted-foreground">{p.agency}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.modality}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.state}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.is_srp ? 'Sim' : 'Não'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-mono text-card-foreground">{formatCurrency(p.estimated_value)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{formatDate(p.opening_date)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{formatDate(p.closing_date)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${p.status === 'Aberto' ? 'bg-success/10 text-success' : p.status === 'Encerrado' ? 'bg-muted text-muted-foreground' : 'bg-info/10 text-info'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${p.status === 'Aberto' ? 'bg-success' : p.status === 'Encerrado' ? 'bg-muted-foreground' : 'bg-info'}`} />
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/licitacao/${p.id}`)}><Eye className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveToFunnel(p.id)}><FolderPlus className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default SearchProcesses;
