import { useEffect, useState } from 'react';
import { listDocuments, listProcesses, type CompanyDocument, type SavedProcess } from '@/lib/store';
import { formatCurrency, formatDate } from '@/lib/constants';
import { FileText, Search, Play, CheckCircle, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Stats {
  saved: number;
  analysis: number;
  participating: number;
  finished: number;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ saved: 0, analysis: 0, participating: 0, finished: 0 });
  const [recentProcesses, setRecentProcesses] = useState<SavedProcess[]>([]);
  const [recentDocs, setRecentDocs] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const items = (await listProcesses()).filter(i => i.in_funnel);
      setStats({
        saved: items.length,
        analysis: items.filter(i => i.funnel_stage === 'Em análise').length,
        participating: items.filter(i => i.funnel_stage === 'Participando').length,
        finished: items.filter(i => i.funnel_stage === 'Finalizado').length,
      });
      setRecentProcesses(items.slice(0, 5));
      setRecentDocs((await listDocuments()).slice(0, 5));
      setLoading(false);
    };
    load();
  }, []);

  const statCards = [
    { label: 'Processos Salvos', value: stats.saved, icon: Search, color: 'text-primary' },
    { label: 'Em Análise', value: stats.analysis, icon: Clock, color: 'text-info' },
    { label: 'Participando', value: stats.participating, icon: Play, color: 'text-success' },
    { label: 'Finalizados', value: stats.finished, icon: CheckCircle, color: 'text-muted-foreground' },
  ];

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral das suas licitações</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl bg-card p-5 shadow-card transition-all hover:shadow-card-hover">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{card.label}</span>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-card-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl bg-card shadow-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-card-foreground">Processos Recentes</h2>
          </div>
          <div className="overflow-x-auto">
            {recentProcesses.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum processo salvo ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3">Título</th>
                    <th className="px-5 py-3">Valor</th>
                    <th className="px-5 py-3">Etapa</th>
                    <th className="px-5 py-3">Fechamento</th>
                  </tr>
                </thead>
                <tbody>
                  {recentProcesses.map((p) => {
                    const proc = p;
                    return (
                      <tr key={p.key} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/licitacao/${p.source}/${encodeURIComponent(p.external_id)}`)}>
                        <td className="max-w-[200px] truncate px-5 py-3 font-medium text-card-foreground">{proc?.title}</td>
                        <td className="px-5 py-3 tabular-nums font-mono text-card-foreground">{formatCurrency(proc?.estimated_value)}</td>
                        <td className="px-5 py-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{p.funnel_stage}</span></td>
                        <td className="px-5 py-3 text-muted-foreground">{formatDate(proc?.closing_date)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-card shadow-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-card-foreground">Documentos Recentes</h2>
          </div>
          <div className="divide-y divide-border/50">
            {recentDocs.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum documento enviado.</p>
            ) : (
              recentDocs.map((doc: any) => (
                <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">{doc.category} • Validade: {formatDate(doc.expiry_date)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
