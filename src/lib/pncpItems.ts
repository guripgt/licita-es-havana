/**
 * Itens de uma compra no PNCP e destaque dos itens que contêm a palavra-chave buscada.
 * API: https://pncp.gov.br/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens
 */

import { normalizeText, tokenize } from './pncp';

const ITEMS_BASE = 'https://pncp.gov.br/api/pncp/v1/orgaos';
const ITEMS_PAGE_SIZE = 500;
const ITEMS_TIMEOUT_MS = 20000;
/** Uma busca pode listar 100 processos: consulta os itens no máximo 6 compras por vez. */
const MAX_CONCURRENT = 6;

let running = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  // A vaga passa direto para quem está na fila, então uma chamada nova não fura a fila.
  if (running >= MAX_CONCURRENT) await new Promise<void>(resolve => waiting.push(resolve));
  else running++;
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

export interface ProcessItem {
  numero: number;
  descricao: string;
  quantidade: number | null;
  unidade: string | null;
  valorUnitario: number | null;
  valorTotal: number | null;
  sigiloso: boolean;
}

/** "01815216000178-1-000183/2026" → "01815216000178/compras/2026/183" */
export function compraPath(numeroControlePncp: string): string | null {
  const m = /^(\d{14})-\d+-(\d+)\/(\d{4})$/.exec(numeroControlePncp);
  return m ? `${m[1]}/compras/${m[3]}/${Number(m[2])}` : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeItem(item: any): ProcessItem {
  return {
    numero: item.numeroItem,
    descricao: item.descricao || '',
    quantidade: item.quantidade ?? null,
    unidade: item.unidadeMedida || null,
    valorUnitario: item.valorUnitarioEstimado ?? null,
    valorTotal: item.valorTotal ?? null,
    sigiloso: Boolean(item.orcamentoSigiloso),
  };
}

async function fetchPage(url: string, signal?: AbortSignal): Promise<ProcessItem[]> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ITEMS_TIMEOUT_MS);
    const onCancel = () => controller.abort();
    signal?.addEventListener('abort', onCancel, { once: true });
    try {
      const resp = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (resp.status === 204) return [];
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!Array.isArray(json)) throw new Error('resposta inesperada');
      return json.map(normalizeItem);
    } catch (e) {
      // Uma nova tentativa em falha de conexão (o servidor do PNCP às vezes derruba a conexão)
      if (signal?.aborted || attempt >= 1 || !(e instanceof TypeError)) throw e;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onCancel);
    }
  }
}

const cache = new Map<string, Promise<ProcessItem[]>>();

/** Limpa o cache (usado nos testes). */
export function _clearItemsCache(): void {
  cache.clear();
}

/** Todos os itens da compra, em ordem; o resultado fica em cache durante a sessão. */
export function fetchProcessItems(numeroControlePncp: string, signal?: AbortSignal): Promise<ProcessItem[]> {
  const cached = cache.get(numeroControlePncp);
  if (cached) return cached;

  const path = compraPath(numeroControlePncp);
  const promise = withSlot(async () => {
    if (!path) throw new Error('Não foi possível carregar os itens: número de controle desconhecido');
    const items: ProcessItem[] = [];
    try {
      for (let page = 1; ; page++) {
        const batch = await fetchPage(`${ITEMS_BASE}/${path}/itens?pagina=${page}&tamanhoPagina=${ITEMS_PAGE_SIZE}`, signal);
        items.push(...batch);
        if (batch.length < ITEMS_PAGE_SIZE) break;
      }
    } catch (e) {
      throw new Error(`Não foi possível carregar os itens (${e instanceof Error ? e.message : String(e)})`);
    }
    return items;
  });

  cache.set(numeroControlePncp, promise);
  promise.catch(() => cache.delete(numeroControlePncp)); // erro não fica em cache: dá para tentar de novo
  return promise;
}

/** Itens cuja descrição contém todas as palavras (ou frases entre aspas) buscadas. */
export function matchItems(items: ProcessItem[], searchText: string): ProcessItem[] {
  const terms = tokenize(searchText).map(t => normalizeText(t.replace(/"/g, ''))).filter(Boolean);
  if (terms.length === 0) return [];
  return items.filter(item => {
    const text = normalizeText(item.descricao);
    return terms.every(t => text.includes(t));
  });
}
