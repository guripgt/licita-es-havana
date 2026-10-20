/**
 * Busca do portal do PNCP (a mesma usada em pncp.gov.br/app/editais): procura por palavra-chave
 * e filtra por situação, UF e modalidade no servidor, em uma chamada rápida.
 * Não é documentada oficialmente; se falhar, search.ts cai para a API de consultas.
 */

import type { NormalizedProcess, SearchFilters } from '@/types/processes';
import { applyLocalFilters, PNCP_ESFERA_MAP, type SearchBatch, type SearchSession } from './pncp';

const SEARCH_BASE = 'https://pncp.gov.br/api/search/';
const SEARCH_PAGE_SIZE = 100;
const SEARCH_TIMEOUT_MS = 20000;
/** Com filtros só do navegador, lê páginas até achar isto de resultados novos... */
const TARGET_MATCHES = 50;
/** ...ou até este limite de páginas por clique (2.000 editais, ~5s). */
const MAX_PAGES_PER_BATCH = 20;

const STATUS_BY_SITUATION: Record<string, string> = {
  abertas: 'recebendo_proposta',
  julgamento: 'propostas_encerradas',
  encerradas: 'encerradas',
};

function terms(str: string | undefined): string[] {
  return (str || '').split(/\s+/).filter(Boolean);
}

export function buildSearchUrl(filters: SearchFilters, page: number): string {
  const q = [...terms(filters.searchText), ...terms(filters.excludeText).map(t => `-${t}`)].join(' ');
  const params = new URLSearchParams();
  params.set('q', q);
  params.set('tipos_documento', 'edital');
  params.set('ordenacao', '-data');
  params.set('pagina', String(page));
  params.set('tam_pagina', String(SEARCH_PAGE_SIZE));
  params.set('status', STATUS_BY_SITUATION[filters.situation || 'abertas'] || 'todos');
  if (filters.uf) params.set('ufs', filters.uf);
  if (filters.modality) params.set('modalidades', String(filters.modality));
  return `${SEARCH_BASE}?${params.toString()}`;
}

const emptyToNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeSearchItem(item: any): NormalizedProcess {
  const controle = item.numero_controle_pncp || item.id || '';
  const compraPath = typeof item.item_url === 'string' ? item.item_url.replace(/^\/compras\//, '') : '';
  const description = item.description || item.title || 'Sem título';
  return {
    id: `pncp_${controle}`,
    external_id: controle,
    source: 'PNCP',
    title: description,
    object_description: description,
    agency: item.orgao_nome || 'Não informado',
    government_level: PNCP_ESFERA_MAP[item.esfera_id] || item.esfera_nome || null,
    modality: item.modalidade_licitacao_nome || null,
    estimated_value: item.valor_total_estimado ?? null,
    homologated_value: item.valor_total_homologado ?? null,
    is_srp: item.srp ?? null,
    state: item.uf || null,
    city: item.municipio_nome || null,
    publication_date: emptyToNull(item.data_publicacao_pncp)?.substring(0, 10) ?? null,
    opening_date: emptyToNull(item.data_inicio_vigencia),
    closing_date: emptyToNull(item.data_fim_vigencia),
    status: item.situacao_nome || null,
    status_id: item.situacao_id != null && item.situacao_id !== '' ? Number(item.situacao_id) : null,
    source_portal: 'PNCP',
    external_url: compraPath ? `https://pncp.gov.br/app/editais/${compraPath}` : emptyToNull(item.link_sistema_origem),
  };
}

async function fetchOnce(url: string, signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  const onCancel = () => controller.abort();
  signal?.addEventListener('abort', onCancel, { once: true });
  try {
    const resp = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error(`Busca do PNCP indisponível (HTTP ${resp.status})`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any;
    try { json = await resp.json(); } catch { json = null; }
    if (!Array.isArray(json?.items) || typeof json?.total !== 'number') {
      throw new Error('Resposta inesperada da busca do PNCP');
    }
    return { data: json.items.map(normalizeSearchItem) as NormalizedProcess[], total: json.total as number };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCancel);
  }
}

/** Uma página da busca; repete uma vez em falha de rede (o servidor às vezes derruba a conexão). */
export async function fetchSearchPage(url: string, signal?: AbortSignal): Promise<{ data: NormalizedProcess[]; total: number }> {
  try {
    return await fetchOnce(url, signal);
  } catch (e) {
    if (signal?.aborted || !(e instanceof TypeError)) throw e;
    return await fetchOnce(url, signal);
  }
}

/** Filtros que a busca do portal não oferece e precisam ser aplicados no navegador. */
function hasLocalFilters(f: SearchFilters): boolean {
  return Boolean(f.city || f.agency || (f.srp && f.srp !== 'all') || f.minValue != null || f.maxValue != null
    || f.openDateStart || f.openDateEnd || f.closeDateStart || f.closeDateEnd || f.pubDateStart || f.pubDateEnd
    || ['revogadas', 'anuladas', 'suspensas'].includes(f.situation || ''));
}

export function createPortalSearch(filters: SearchFilters, today: Date = new Date()): SearchSession {
  // Texto e situação aberta/julgamento/encerrada já vêm filtrados do servidor.
  const situation = filters.situation || 'abertas';
  const localFilters: SearchFilters = {
    ...filters,
    searchText: undefined,
    excludeText: undefined,
    situation: ['revogadas', 'anuladas', 'suspensas'].includes(situation) ? situation : 'todas',
  };
  const local = hasLocalFilters(filters);
  const controller = new AbortController();
  const seen = new Set<string>();
  let nextPage = 1;
  let total: number | null = null;
  let scanned = 0;
  let exhausted = false;
  let inFlight: Promise<SearchBatch> | null = null;

  const hasMore = () => !exhausted && (total === null || (nextPage - 1) * SEARCH_PAGE_SIZE < total);

  async function readBatch(onProgress?: (partial: SearchBatch) => void): Promise<SearchBatch> {
    const data: NormalizedProcess[] = [];
    let error: string | null = null;

    const snapshot = (): SearchBatch => ({
      data: [...data],
      scanned,
      total: total ?? 0,
      sources: [error
        ? { name: 'PNCP', status: 'error', message: error }
        : { name: 'PNCP', status: scanned === 0 ? 'empty' : 'ok', message: scanned === 0 ? 'Nenhum edital encontrado' : undefined }],
      hasMore: hasMore(),
      mode: 'busca',
      exact: !local,
    });

    for (let pages = 0; pages < MAX_PAGES_PER_BATCH && hasMore() && !controller.signal.aborted; pages++) {
      try {
        const page = await fetchSearchPage(buildSearchUrl(filters, nextPage), controller.signal);
        if (controller.signal.aborted) break;
        total = page.total;
        nextPage++;
        scanned += page.data.length;
        if (page.data.length === 0) exhausted = true;
        const fresh = page.data.filter(p => !seen.has(p.id) && seen.add(p.id));
        data.push(...applyLocalFilters(fresh, localFilters, today));
        onProgress?.(snapshot());
      } catch (e) {
        if (controller.signal.aborted) break;
        // Na primeira página o erro sobe para search.ts acionar o plano B.
        if (scanned === 0) throw e;
        error = e instanceof Error ? e.message : String(e);
        break;
      }
      if (!local || data.length >= TARGET_MATCHES) break;
    }
    return snapshot();
  }

  return {
    next(onProgress) {
      if (!inFlight) inFlight = readBatch(onProgress).finally(() => { inFlight = null; });
      return inFlight;
    },
    cancel() {
      controller.abort();
    },
  };
}
