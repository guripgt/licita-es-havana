import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, FolderCheck, FolderPlus, Star } from 'lucide-react';
import { toast } from 'sonner';
import { listProcesses, saveProcess, type SavedProcess } from '@/lib/store';
import { formatCurrency, formatDate } from '@/lib/constants';
import { situationBadge } from '@/lib/situation';
import { Button } from '@/components/ui/button';

const TONE_CLASSES = {
  open: { color: 'bg-emerald-500/10 text-emerald-700', dot: 'bg-emerald-500' },
  closed: { color: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
  pending: { color: 'bg-warning/10 text-warning', dot: 'bg-warning' },
};

const Favorites = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<SavedProcess[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProcesses()
      .then(all => setItems(all.filter(p => p.is_favorite)))
      .catch(err => toast.error('Erro ao ler favoritos: ' + err.message))
      .finally(() => setLoading(false));
  }, []);

  const open = (p: SavedProcess) => navigate(`/licitacao/${p.source}/${encodeURIComponent(p.external_id)}`);

  const unfavorite = async (p: SavedProcess) => {
    await saveProcess(p, { is_favorite: false });
    setItems(prev => prev.filter(i => i.key !== p.key));
    toast.success('Removido dos favoritos');
  };

  const addToFunnel = async (p: SavedProcess) => {
    const updated = await saveProcess(p, { in_funnel: true });
    setItems(prev => prev.map(i => (i.key === p.key ? updated : i)));
    toast.success('Processo salvo no funil!');
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Favoritos</h1>
        <p className="text-sm text-muted-foreground">Licitações que você marcou com a estrela</p>
      </div>

      <div className="rounded-xl bg-card shadow-card overflow-hidden">
        {items.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Star className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum favorito ainda.</p>
            <p className="mt-1 text-xs text-muted-foreground">Na busca, clique na estrela de uma licitação para guardá-la aqui.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* table-fixed: Título e Órgão dividem o espaço que sobra, e Ações nunca fica cortada */}
            <table className="w-full table-fixed text-sm" style={{ minWidth: '800px' }}>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3" style={{ width: 40 }}></th>
                  <th className="px-3 py-3" style={{ width: '60%' }}>Título</th>
                  <th className="px-3 py-3" style={{ width: '40%' }}>Órgão</th>
                  <th className="px-3 py-3" style={{ width: 50 }}>UF</th>
                  <th className="px-3 py-3 text-right" style={{ width: 140 }}>Valor</th>
                  <th className="px-3 py-3" style={{ width: 110 }}>Fechamento</th>
                  <th className="px-3 py-3" style={{ width: 160 }}>Situação</th>
                  <th className="px-3 py-3" style={{ width: 90 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map(p => {
                  const { label, tone } = situationBadge(p);
                  const badge = TONE_CLASSES[tone];
                  return (
                    <tr key={p.key} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          aria-label="Remover dos favoritos"
                          title="Remover dos favoritos"
                          onClick={() => unfavorite(p)}
                          className="text-warning transition-colors hover:text-muted-foreground"
                        >
                          <Star className="h-4 w-4 fill-warning" />
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => open(p)} title={p.title} className="block w-full truncate text-left font-medium text-card-foreground hover:text-primary">
                          {p.title}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block truncate text-muted-foreground">{p.agency}</span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{p.state || '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap text-card-foreground">{formatCurrency(p.estimated_value)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{formatDate(p.closing_date)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${badge.color}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                          {label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Ver detalhes" title="Ver detalhes" onClick={() => open(p)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {p.in_funnel ? (
                            <span className="inline-flex h-7 w-7 items-center justify-center text-primary" title={`No funil: ${p.funnel_stage}`} aria-label="Já está no funil">
                              <FolderCheck className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Salvar no funil" title="Salvar no funil" onClick={() => addToFunnel(p)}>
                              <FolderPlus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Favorites;
