/**
 * Cliente da API pública de consultas do PNCP, chamado direto do navegador.
 * Manual: https://pncp.gov.br/api/consulta/swagger-ui/index.html
 */

import type { NormalizedProcess, SearchFilters, SourceStatus } from '@/types/processes';

const PNCP_BASE = 'https://pncp.gov.br/api/consulta';
const PAGE_SIZE = 50; // máximo aceito pela API
const REQUEST_TIMEOUT_MS = 30000;
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

const PNCP_ESFERA_MAP: Record<string, string> = {
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

async function fetchOnce(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (resp.status === 204) return { data: [], totalRegistros: 0, totalPaginas: 0 };
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
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Tempo esgotado ao consultar o PNCP');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPncpPage(url: string): Promise<{ data: NormalizedProcess[]; totalRegistros: number; totalPaginas: number }> {
  try {
    return await fetchOnce(url);
  } catch {
    return await fetchOnce(url);
  }
}

const PAGES_PER_BATCH = 5;
const MODALITY_CONCURRENCY = 4;
const MAX_PUBLICATION_DAYS = 365;

const SITUATION_STATUS_ID: Partial<Record<string, number>> = { revogadas: 2, anuladas: 3, suspensas: 4 };

function normalizeText(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function terms(str: string): string[] {
  return normalizeText(str).split(/\s+/).filter(Boolean);
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
    if (situation === 'encerradas') {
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
export function createSearch(filters: SearchFilters, today: Date = new Date()): { next(): Promise<SearchBatch> } {
  const cursors: ModalityCursor[] = (filters.modality ? [filters.modality] : PNCP_MODALITIES.map(m => m.code))
    .map(code => ({ code, nextPage: 1, totalPages: null, done: false }));
  const seen = new Set<string>();
  let scanned = 0;
  let total = 0;

  async function readModality(cursor: ModalityCursor, found: NormalizedProcess[], errors: string[]) {
    for (let i = 0; i < PAGES_PER_BATCH && !cursor.done; i++) {
      try {
        const page = await fetchPncpPage(buildPncpUrl(filters, cursor.code, cursor.nextPage, today));
        if (cursor.totalPages === null) total += page.totalRegistros;
        cursor.totalPages = page.totalPaginas;
        scanned += page.data.length;
        found.push(...page.data);
        cursor.nextPage++;
        if (cursor.nextPage > cursor.totalPages) cursor.done = true;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
        cursor.done = true;
      }
    }
  }

  return {
    async next() {
      const found: NormalizedProcess[] = [];
      const errors: string[] = [];
      const pending = cursors.filter(c => !c.done);
      for (let i = 0; i < pending.length; i += MODALITY_CONCURRENCY) {
        await Promise.all(pending.slice(i, i + MODALITY_CONCURRENCY).map(c => readModality(c, found, errors)));
      }

      const fresh = found.filter(p => !seen.has(p.id) && seen.add(p.id));
      const data = applyLocalFilters(fresh, filters, today);

      let source: SourceStatus;
      if (errors.length) source = { name: 'PNCP', status: 'error', message: `Falha em ${errors.length} consulta(s): ${errors[0]}` };
      else if (scanned === 0) source = { name: 'PNCP', status: 'empty', message: 'Nenhum edital encontrado' };
      else source = { name: 'PNCP', status: 'ok' };

      return { data, scanned, total, sources: [source], hasMore: cursors.some(c => !c.done) };
    },
  };
}
