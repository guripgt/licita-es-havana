import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { FUNNEL_STAGES, formatCurrency, formatDate } from '@/lib/constants';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { GripVertical } from 'lucide-react';

const Funnel = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragItem, setDragItem] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.company_id) { setLoading(false); return; }
    const load = async () => {
      const { data } = await supabase
        .from('saved_processes')
        .select('*, public_processes(title, agency, modality, estimated_value, closing_date)')
        .eq('company_id', profile.company_id!);
      setItems(data || []);
      setLoading(false);
    };
    load();
  }, [profile?.company_id]);

  const moveToStage = async (itemId: string, newStage: string) => {
    await supabase.from('saved_processes').update({ funnel_stage: newStage }).eq('id', itemId);
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, funnel_stage: newStage } : i));
    toast.success(`Movido para "${newStage}"`);
  };

  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDragItem(itemId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    if (dragItem) moveToStage(dragItem, stage);
    setDragItem(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Funil Operacional</h1>
        <p className="text-sm text-muted-foreground">Arraste os cards entre as colunas para gerenciar o fluxo</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 200px)' }}>
        {FUNNEL_STAGES.map(stage => {
          const stageItems = items.filter(i => i.funnel_stage === stage);
          return (
            <div
              key={stage}
              className="flex w-[280px] shrink-0 flex-col rounded-xl bg-muted/50"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage)}
            >
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{stage}</h3>
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">{stageItems.length}</span>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {stageItems.map(item => {
                  const proc = item.public_processes as any;
                  const isUrgent = proc?.closing_date && new Date(proc.closing_date).getTime() - Date.now() < 48 * 60 * 60 * 1000;
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, item.id)}
                      className="cursor-grab rounded-lg bg-card p-3.5 shadow-card transition-all hover:shadow-card-hover active:cursor-grabbing active:scale-[1.02] active:rotate-1"
                      onClick={() => navigate(`/licitacao/${item.public_process_id}`)}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-semibold leading-tight text-card-foreground">{proc?.title}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{proc?.agency}</p>
                          <p className="text-xs text-muted-foreground">{proc?.modality}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-border/30 pt-2.5">
                        <span className="text-sm font-mono font-medium tabular-nums text-card-foreground">{formatCurrency(proc?.estimated_value)}</span>
                        <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${isUrgent ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                          {formatDate(proc?.closing_date)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Funnel;
