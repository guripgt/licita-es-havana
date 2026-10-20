import { useEffect, useState } from 'react';
import { Loader2, ListChecks } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import { fetchProcessItems, matchItems, type ProcessItem } from '@/lib/pncpItems';

const VISIBLE_ITEMS = 5;

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; items: ProcessItem[] };

function formatQuantity(item: ProcessItem): string {
  if (item.quantidade == null) return '—';
  const qty = item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  return item.unidade ? `${qty} ${item.unidade}` : qty;
}

function formatValue(item: ProcessItem, value: number | null): string {
  if (item.sigiloso && value == null) return 'Sigiloso';
  return formatCurrency(value);
}

/** Linha cinza abaixo do processo com os itens do edital que contêm a palavra-chave buscada. */
export function MatchedItemsRow({ externalId, searchText, colSpan }: { externalId: string; searchText: string; colSpan: number }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    fetchProcessItems(externalId)
      .then(all => { if (active) setState({ status: 'done', items: matchItems(all, searchText) }); })
      .catch(err => { if (active) setState({ status: 'error', message: err.message }); });
    return () => { active = false; };
  }, [externalId, searchText, attempt]);

  const term = searchText.trim();

  let content: React.ReactNode;
  if (state.status === 'loading') {
    content = (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Buscando itens com “{term}”…
      </span>
    );
  } else if (state.status === 'error') {
    content = (
      <span className="text-muted-foreground">
        {state.message}.{' '}
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => setAttempt(a => a + 1)}>
          Tentar de novo
        </button>
      </span>
    );
  } else if (state.items.length === 0) {
    content = (
      <span className="text-muted-foreground">
        Nenhum item com “{term}” na descrição — a palavra aparece em outro campo do edital.
      </span>
    );
  } else {
    const shown = expanded ? state.items : state.items.slice(0, VISIBLE_ITEMS);
    const hidden = state.items.length - shown.length;
    content = (
      <div className="space-y-1">
        {shown.map(item => (
          <div key={item.numero} className="grid grid-cols-[72px_minmax(0,1fr)_140px_150px_160px] items-center gap-3">
            <span className="font-semibold text-card-foreground">Item {item.numero}</span>
            <span className="truncate text-card-foreground" title={item.descricao}>{item.descricao}</span>
            <span className="text-right tabular-nums text-muted-foreground">{formatQuantity(item)}</span>
            <span className="text-right tabular-nums text-muted-foreground">
              Unit. <span className="font-mono text-card-foreground">{formatValue(item, item.valorUnitario)}</span>
            </span>
            <span className="text-right tabular-nums text-muted-foreground">
              Total <span className="font-mono font-medium text-card-foreground">{formatValue(item, item.valorTotal)}</span>
            </span>
          </div>
        ))}
        {(hidden > 0 || expanded) && state.items.length > VISIBLE_ITEMS && (
          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setExpanded(e => !e)}>
            {expanded ? 'ver menos' : `ver mais ${hidden} ${hidden === 1 ? 'item' : 'itens'}`}
          </button>
        )}
      </div>
    );
  }

  return (
    <tr className="border-b border-border/50 bg-muted/60">
      <td colSpan={colSpan} className="p-0 text-xs">
        {/* Fica presa à área visível da tabela (100cqi = largura do quadro com rolagem), assim
            quantidade e valores aparecem sem rolar para o lado. */}
        <div className="sticky left-0 flex w-full gap-2 py-2 pl-[52px] pr-4 [@supports(width:1cqi)]:w-[100cqi]">
          <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">{content}</div>
        </div>
      </td>
    </tr>
  );
}
