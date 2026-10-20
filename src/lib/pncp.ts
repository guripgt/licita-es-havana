/**
 * Cliente da API pública de consultas do PNCP, chamado direto do navegador.
 * Manual: https://pncp.gov.br/api/consulta/swagger-ui/index.html
 */

import type { NormalizedProcess, SearchFilters } from '@/types/processes';

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
