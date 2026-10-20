/**
 * Cliente da API pública de consultas do PNCP, chamado direto do navegador.
 * Manual: https://pncp.gov.br/api/consulta/swagger-ui/index.html
 */

import type { NormalizedProcess, SearchFilters, SourceStatus } from '@/types/processes';

const PNCP_BASE = 'https://pncp.gov.br/api/consulta';
const PAGE_SIZE = 50; // máximo aceito pela API
const REQUEST_TIMEOUT_MS = 60000; // o PNCP chega a levar ~30s em consultas grandes
/** Esperas após HTTP 429; o PNCP não envia Retry-After e o bloqueio dura ~5–10s. */
const RATE_LIMIT_DELAYS_MS = [3000, 6000, 12000];
const DAY_MS = 24 * 60 * 60 * 1000;

export const PNCP_MODALITIES: { code: number; label: string }[] = [
  { code: 1, label: 'Leilão - Eletrônico' },
  { code: 2, label: 'Diálogo Competitivo' },
  { code: 3, label: 'Concurso' },
  { code: 4, label: 'Concorrência - Eletrônica' },
  { code: 5, label: 'Concorrência - Presencial' },
  { code: 6, label: 'Pregão - Eletrônico' },
  { code: 7, label: 'Pregão - Presencial' },
  { code: 8, label: 'Dispensa de Licitação' },
  { code: 9, label: 'Inexigibilidade' },
  { code: 10, label: 'Manifestação de Interesse' },
  { code: 11, label: 'Pré-qualificação' },
  { code: 12, label: 'Credenciamento' },
  { code: 13, label: 'Leilão - Presencial' },
];

export const PNCP_ESFERA_MAP: Record<string, string> = {
  F: 'Federal', E: 'Estadual', M: 'Municipal', D: 'Distrital',
};

/** Data local no formato AAAAMMDD exigido pela API. */
function toPncpDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function isoToPncpDate(iso: string): string {
  return iso.replace(/-/g, '');
}

export function buildPncpUrl(filters: SearchFilters, modalityCode: number, page: number, today: Date): string {
  const params = new URLSearchParams();
  let endpoint: string;

  if (!filters.situation || filters.situation === 'abertas') {
    endpoint = '/v1/contratacoes/proposta';
    params.set('dataFinal', filters.closeDateEnd
      ? isoToPncpDate(filters.closeDateEnd)
      : toPncpDate(new Date(today.getTime() + 365 * DAY_MS)));
  } else {
    endpoint = '/v1/contratacoes/publicacao';
    params.set('dataInicial', filters.pubDateStart
      ? isoToPncpDate(filters.pubDateStart)
      : toPncpDate(new Date(today.getTime() - 90 * DAY_MS)));
    params.set('dataFinal', filters.pubDateEnd ? isoToPncpDate(filters.pubDateEnd) : toPncpDate(today));
  }

  params.set('codigoModalidadeContratacao', String(modalityCode));
  if (filters.uf) params.set('uf', filters.uf);
  params.set('pagina', String(page));
  params.set('tamanhoPagina', String(PAGE_SIZE));

  return `${PNCP_BASE}${endpoint}?${params.toString()}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizePncpRecord(record: any): NormalizedProcess {
  const orgao = record.orgaoEntidade || {};
  const unidade = record.unidadeOrgao || {};
  const controlePNCP = record.numeroControlePNCP || '';
  const cnpj = orgao.cnpj || '';
  const ano = record.anoCompra || '';
  const seq = record.sequencialCompra || '';
  const pncpUrl = (cnpj && ano && seq) ? `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}` : null;
  const externalId = controlePNCP || `${cnpj}-${ano}-${seq}`;

  return {
    id: `pncp_${externalId}`,
    external_id: externalId,
    source: 'PNCP',
    title: record.objetoCompra || 'Sem título',
    object_description: record.informacaoComplementar || record.objetoCompra || '',
    agency: orgao.razaoSocial || 'Não informado',
    government_level: PNCP_ESFERA_MAP[orgao.esferaId] || orgao.esferaId || null,
    modality: record.modalidadeNome || null,
    estimated_value: record.valorTotalEstimado ?? null,
    homologated_value: record.valorTotalHomologado ?? null,
    is_srp: record.srp ?? null,
    state: unidade.ufSigla || null,
    city: unidade.municipioNome || null,
    publication_date: record.dataPublicacaoPncp ? record.dataPublicacaoPncp.substring(0, 10) : null,
    opening_date: record.dataAberturaProposta || null,
    closing_date: record.dataEncerramentoProposta || null,
    status: record.situacaoCompraNome || null,
    status_id: record.situacaoCompraId ?? null,
    source_portal: 'PNCP',
    external_url: pncpUrl || record.linkSistemaOrigem || null,
  };
}

class RateLimitError extends Error {}
export class CancelledError extends Error {}

const OFFLINE_MESSAGE = 'Sem conexão com a internet.';

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new CancelledError('Busca cancelada')); }, { once: true });
  });
}

async function fetchOnce(url: string, signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onCancel = () => controller.abort();
  signal?.addEventListener('abort', onCancel, { once: true });
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (resp.status === 204) return { data: [], totalRegistros: 0, totalPaginas: 0 };
    if (resp.status === 429) throw new RateLimitError('PNCP limitou as consultas');
    const text = await resp.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }
    if (!resp.ok) throw new Error(json?.message || `HTTP ${resp.status}`);
    return {
      data: (json?.data || []).map(normalizePncpRecord),
      totalRegistros: json?.totalRegistros || 0,
      totalPaginas: json?.totalPaginas || 0,
    };
  } catch (e) {
    if (signal?.aborted) throw new CancelledError('Busca cancelada');
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Tempo esgotado ao consultar o PNCP');
    if (isOffline()) throw new Error(OFFLINE_MESSAGE);
    // O 429 do PNCP chega sem cabeçalho CORS: no navegador ele aparece só como falha de rede.
    if (e instanceof TypeError) throw new RateLimitError('PNCP limitou as consultas');
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCancel);
  }
}

/** Busca uma página; espera e repete quando o PNCP limita (429 ou falha de rede) e repete uma vez em outras falhas. */
export async function fetchPncpPage(url: string, signal?: AbortSignal): Promise<{ data: NormalizedProcess[]; totalRegistros: number; totalPaginas: number }> {
  let rateLimitHits = 0;
  let otherFailures = 0;
  for (;;) {
    if (isOffline()) throw new Error(OFFLINE_MESSAGE);
    try {
      return await fetchOnce(url, signal);
    } catch (e) {
      if (e instanceof CancelledError || (e instanceof Error && e.message === OFFLINE_MESSAGE)) throw e;
      if (e instanceof RateLimitError) {
        if (rateLimitHits >= RATE_LIMIT_DELAYS_MS.length) {
          throw new Error('PNCP limitou as consultas. Aguarde alguns segundos e clique em "Buscar mais".');
        }
        await sleep(RATE_LIMIT_DELAYS_MS[rateLimitHits++], signal);
      } else if (otherFailures++ >= 1) {
        throw e;
      }
    }
  }
}

const PAGES_PER_BATCH = 5;
const MODALITY_CONCURRENCY = 2;

const MAX_PUBLICATION_DAYS = 365;

const SITUATION_STATUS_ID: Partial<Record<string, number>> = { revogadas: 2, anuladas: 3, suspensas: 4 };

export function normalizeText(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Separa palavras, mantendo "frases entre aspas" como um item só (com as aspas). */
export function tokenize(str: string | undefined): string[] {
  return (str || '').match(/"[^"]+"|\S+/g) ?? [];
}

function terms(str: string): string[] {
  return tokenize(str).map(t => normalizeText(t.replace(/"/g, ''))).filter(Boolean);
}

function inDateRange(value: string | null, start?: string, end?: string): boolean {
  if (!start && !end) return true;
  if (!value) return false;
  const day = value.substring(0, 10);
  return (!start || day >= start) && (!end || day <= end);
}

/** Valida os filtros antes de consultar a API; retorna a mensagem de erro ou null. */
export function validateFilters(filters: SearchFilters): string | null {
  if (!filters.situation || filters.situation === 'abertas') return null;
  if (filters.pubDateStart && filters.pubDateEnd) {
    if (filters.pubDateStart > filters.pubDateEnd) return 'A data inicial de publicação é posterior à final.';
    // Esses filtros usam a API oficial de consultas, que limita o período a 365 dias.
    const days = (Date.parse(filters.pubDateEnd) - Date.parse(filters.pubDateStart)) / DAY_MS;
    if (days > MAX_PUBLICATION_DAYS) return 'O período de publicação não pode passar de 365 dias.';
  }
  return null;
}

/** Filtros que a API não oferece, aplicados sobre os registros já lidos. */
export function applyLocalFilters(list: NormalizedProcess[], filters: SearchFilters, now: Date): NormalizedProcess[] {
  const include = filters.searchText ? terms(filters.searchText) : [];
  const exclude = filters.excludeText ? terms(filters.excludeText) : [];
  const city = filters.city ? normalizeText(filters.city) : '';
  const agency = filters.agency ? normalizeText(filters.agency) : '';
  const situation = filters.situation || 'abertas';

  return list.filter(r => {
    const text = normalizeText(`${r.title} ${r.object_description} ${r.agency}`);
    if (include.length && !include.every(t => text.includes(t))) return false;
    if (exclude.length && exclude.some(t => text.includes(t))) return false;
    if (city && !(r.city && normalizeText(r.city).includes(city))) return false;
    if (agency && !normalizeText(r.agency).includes(agency)) return false;
    if (filters.srp === 'sim' && r.is_srp !== true) return false;
    if (filters.srp === 'nao' && r.is_srp !== false) return false;
    if (filters.minValue != null && (r.estimated_value == null || r.estimated_value < filters.minValue)) return false;
    if (filters.maxValue != null && (r.estimated_value == null || r.estimated_value > filters.maxValue)) return false;
    if (!inDateRange(r.opening_date, filters.openDateStart, filters.openDateEnd)) return false;
    if (!inDateRange(r.closing_date, filters.closeDateStart, filters.closeDateEnd)) return false;
    if (!inDateRange(r.publication_date, filters.pubDateStart, filters.pubDateEnd)) return false;
    if (situation === 'abertas') {
      if (r.status_id != null && r.status_id !== 1) return false;
    } else if (situation === 'encerradas' || situation === 'julgamento') {
      if (r.status_id !== 1 || !r.closing_date || new Date(r.closing_date) >= now) return false;
    } else if (SITUATION_STATUS_ID[situation] && r.status_id !== SITUATION_STATUS_ID[situation]) {
      return false;
    }
    return true;
  });
}

export interface SearchBatch {
  data: NormalizedProcess[];
  scanned: number;
  total: number;
  sources: SourceStatus[];
  hasMore: boolean;
  /** 'busca' = busca do portal (filtra no servidor); 'consulta' = API oficial de consultas (filtra no navegador). */
  mode: 'busca' | 'consulta';
  /** true quando `total` é exatamente o número de resultados (nenhum filtro aplicado no navegador). */
  exact: boolean;
}

interface ModalityCursor {
  code: number;
  nextPage: number;
  totalPages: number | null;
  done: boolean;
}

/**
 * Sessão de busca incremental: cada next() lê até 5 páginas de cada modalidade
 * pendente e devolve só os registros novos que passam nos filtros locais.
 */
export interface SearchSession {
  /** Lê o próximo lote; se um lote já está em andamento, devolve a mesma promessa. */
  next(onProgress?: (partial: SearchBatch) => void): Promise<SearchBatch>;
  /** Interrompe as requisições pendentes desta sessão. */
  cancel(): void;
}

/** Busca pela API oficial de consultas: lê editais por modalidade e filtra no navegador. */
export function createConsultaSearch(filters: SearchFilters, today: Date = new Date()): SearchSession {
  const cursors: ModalityCursor[] = (filters.modality ? [filters.modality] : PNCP_MODALITIES.map(m => m.code))
    .map(code => ({ code, nextPage: 1, totalPages: null, done: false }));
  const seen = new Set<string>();
  const controller = new AbortController();
  let inFlight: Promise<SearchBatch> | null = null;
  let scanned = 0;
  let total = 0;

  async function readModality(cursor: ModalityCursor, onPage: (records: NormalizedProcess[]) => void, errors: string[]) {
    for (let i = 0; i < PAGES_PER_BATCH && !cursor.done && !controller.signal.aborted; i++) {
      try {
        const page = await fetchPncpPage(buildPncpUrl(filters, cursor.code, cursor.nextPage, today), controller.signal);
        if (controller.signal.aborted) return;
        if (cursor.totalPages === null) total += page.totalRegistros;
        cursor.totalPages = page.totalPaginas;
        scanned += page.data.length;
        onPage(page.data);
        cursor.nextPage++;
        if (cursor.nextPage > cursor.totalPages) cursor.done = true;
      } catch (e) {
        // Mantém a modalidade pendente: o próximo next() tenta a mesma página de novo.
        if (!controller.signal.aborted) errors.push(e instanceof Error ? e.message : String(e));
        return;
      }
    }
  }

  async function readBatch(onProgress?: (partial: SearchBatch) => void): Promise<SearchBatch> {
    const data: NormalizedProcess[] = [];
    const errors: string[] = [];

    const snapshot = (): SearchBatch => {
      let source: SourceStatus;
      if (errors.length) source = { name: 'PNCP', status: 'error', message: `Falha em ${errors.length} consulta(s): ${errors[0]}` };
      else if (scanned === 0) source = { name: 'PNCP', status: 'empty', message: 'Nenhum edital encontrado' };
      else source = { name: 'PNCP', status: 'ok' };
      return { data: [...data], scanned, total, sources: [source], hasMore: cursors.some(c => !c.done), mode: 'consulta', exact: false };
    };

    const onPage = (records: NormalizedProcess[]) => {
      const fresh = records.filter(p => !seen.has(p.id) && seen.add(p.id));
      data.push(...applyLocalFilters(fresh, filters, today));
      onProgress?.(snapshot());
    };

    const pending = cursors.filter(c => !c.done);
    for (let i = 0; i < pending.length && !controller.signal.aborted; i += MODALITY_CONCURRENCY) {
      await Promise.all(pending.slice(i, i + MODALITY_CONCURRENCY).map(c => readModality(c, onPage, errors)));
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
