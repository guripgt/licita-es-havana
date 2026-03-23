/**
 * Edge Function: search-processes
 * 
 * Consulta APIs públicas de licitações no backend, normaliza e retorna formato unificado.
 * 
 * FONTE PRINCIPAL: PNCP (https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao)
 *   - Params: dataInicial, dataFinal (YYYYMMDD), codigoModalidadeContratacao, pagina, tamanhoPagina
 *   - codigoModalidadeContratacao é OBRIGATÓRIO → iteramos múltiplas modalidades quando não filtrado
 *   - Não suporta full-text search → filtro textual aplicado server-side após consulta
 *   - Não suporta filtro por UF, valor, cidade → filtrado server-side
 * 
 * FONTE SECUNDÁRIA (opcional): Compras.gov (http://compras.dados.gov.br/licitacoes/v1/licitacoes.json)
 *   - API instável, frequentemente 503. Não bloqueia resultado principal.
 *   - Desativável via COMPRAS_GOV_ENABLED flag
 * 
 * ESTRATÉGIA DE BUSCA TEXTUAL:
 *   A busca por palavra-chave é feita localmente (server-side) porque o PNCP não oferece
 *   full-text search no endpoint de publicação. O fluxo é:
 *   1. Consultar PNCP com filtros suportados (data, modalidade)
 *   2. Normalizar resultados
 *   3. Aplicar filtro textual em title + object_description + agency (case-insensitive, sem acentos)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Feature flag: set to false to disable Compras.gov entirely
const COMPRAS_GOV_ENABLED = false; // Desabilitado por instabilidade frequente

// ============================================================
// TYPES
// ============================================================

interface SearchFilters {
  searchText?: string;
  excludeText?: string;
  modality?: string;
  openDateStart?: string;
  openDateEnd?: string;
  closeDateStart?: string;
  closeDateEnd?: string;
  uf?: string;
  city?: string;
  agency?: string;
  srp?: string;
  minValue?: number;
  maxValue?: number;
  status?: string;
  page?: number;
  pageSize?: number;
}

interface NormalizedProcess {
  id: string;
  external_id: string;
  source: "PNCP" | "COMPRAS_GOV";
  title: string;
  object_description: string;
  agency: string;
  government_level: string | null;
  modality: string | null;
  estimated_value: number | null;
  is_srp: boolean | null;
  state: string | null;
  city: string | null;
  publication_date: string | null;
  opening_date: string | null;
  closing_date: string | null;
  status: string | null;
  source_portal: string | null;
  external_url: string | null;
}

interface SearchResult {
  data: NormalizedProcess[];
  totalRecords: number;
  page: number;
  pageSize: number;
  sources: { name: string; status: "ok" | "error" | "empty" | "disabled"; message?: string }[];
  demoMode: boolean;
}

// ============================================================
// TEXT NORMALIZATION (remove acentos para comparação)
// ============================================================

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(str: string): string {
  return removeAccents(str).toLowerCase().trim();
}

// ============================================================
// PNCP SERVICE
// ============================================================

const PNCP_BASE = "https://pncp.gov.br/api/consulta";

// Mapa UI label → código PNCP (obrigatório na API)
const PNCP_MODALITY_MAP: Record<string, number> = {
  "Leilão - Eletrônico": 1,
  "Diálogo Competitivo": 2,
  "Concorrência - Eletrônica": 3,
  "Concorrência - Presencial": 4,
  "Pregão Presencial": 5,
  "Pregão - Presencial": 5,
  "Pregão Eletrônico": 6,
  "Pregão - Eletrônico": 6,
  "Dispensa de Licitação": 7,
  "Inexigibilidade": 8,
  "Leilão - Presencial": 9,
  "Concorrência": 3,
  "Leilão": 1,
};

// Modalidades padrão para busca sem filtro – incluímos todas para máxima cobertura
const DEFAULT_MODALITY_CODES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const PNCP_ESFERA_MAP: Record<string, string> = {
  "F": "Federal",
  "E": "Estadual",
  "M": "Municipal",
  "D": "Distrital",
};

function normalizePncpRecord(record: any): NormalizedProcess {
  const orgao = record.orgaoEntidade || {};
  const unidade = record.unidadeOrgao || {};
  const controlePNCP = record.numeroControlePNCP || '';
  
  return {
    id: `pncp_${controlePNCP || `${orgao.cnpj}_${record.anoCompra}_${record.sequencialCompra}`}`,
    external_id: controlePNCP || `${orgao.cnpj}-${record.anoCompra}-${record.sequencialCompra}`,
    source: "PNCP",
    title: record.objetoCompra || "Sem título",
    object_description: record.objetoCompra || "",
    agency: orgao.razaoSocial || "Não informado",
    government_level: PNCP_ESFERA_MAP[orgao.esferaId] || orgao.esferaId || null,
    modality: record.modalidadeNome || null,
    estimated_value: record.valorTotalEstimado ?? record.valorTotalHomologado ?? null,
    is_srp: record.srp ?? null,
    state: unidade.ufSigla || null,
    city: unidade.municipioNome || null,
    publication_date: record.dataPublicacaoPncp ? record.dataPublicacaoPncp.substring(0, 10) : null,
    opening_date: record.dataAberturaProposta ? record.dataAberturaProposta.substring(0, 10) : null,
    closing_date: record.dataEncerramentoProposta || null,
    status: record.situacaoCompraNome || null,
    source_portal: "PNCP",
    // URL correta do PNCP: usar numeroControlePNCP como identificador
    external_url: record.linkSistemaOrigem || (controlePNCP ? `https://pncp.gov.br/app/editais/${controlePNCP}` : null),
  };
}

/** Constrói URLs de consulta ao PNCP para cada modalidade.
 * NOTA: PNCP exige dataInicial e dataFinal. Quando o usuário não informa datas,
 * usamos os últimos 180 dias para máxima cobertura de resultados.
 */
function buildPncpQueries(filters: SearchFilters): { url: string; modalityCode: number }[] {
  const now = new Date();
  // Default: últimos 180 dias para máxima cobertura (PNCP exige datas obrigatórias)
  const defaultDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  const dataInicial = formatPncpDate(
    filters.openDateStart || filters.closeDateStart || defaultDaysAgo.toISOString().substring(0, 10)
  );
  const dataFinal = formatPncpDate(
    filters.openDateEnd || filters.closeDateEnd || now.toISOString().substring(0, 10)
  );

  let modalityCodes: number[];
  if (filters.modality && filters.modality !== 'all') {
    const code = PNCP_MODALITY_MAP[filters.modality];
    modalityCodes = code ? [code] : DEFAULT_MODALITY_CODES;
  } else {
    // Sem modalidade selecionada: buscar em TODAS as modalidades padrão
    modalityCodes = DEFAULT_MODALITY_CODES;
  }

  const page = filters.page || 1;
  // Pedir mais registros por modalidade para ter volume após filtragem local
  const tamanhoPagina = Math.min(500, Math.max(50, filters.pageSize || 50));

  return modalityCodes.map(code => ({
    url: `${PNCP_BASE}/v1/contratacoes/publicacao?dataInicial=${dataInicial}&dataFinal=${dataFinal}&codigoModalidadeContratacao=${code}&pagina=${page}&tamanhoPagina=${tamanhoPagina}`,
    modalityCode: code,
  }));
}

/** Busca resultados de uma modalidade específica no PNCP */
async function fetchPncpByModality(url: string): Promise<{ data: NormalizedProcess[]; total: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) {
      console.error(`PNCP error: ${resp.status} for ${url}`);
      return { data: [], total: 0 };
    }

    const json = await resp.json();
    const records = (json.data || []).map(normalizePncpRecord);
    return { data: records, total: json.totalRegistros || 0 };
  } catch (e) {
    clearTimeout(timeout);
    console.error(`PNCP fetch failed:`, e);
    return { data: [], total: 0 };
  }
}

/** Agrega resultados de múltiplas modalidades PNCP */
async function aggregatePncpResults(filters: SearchFilters): Promise<{ data: NormalizedProcess[]; total: number; error?: string }> {
  try {
    const queries = buildPncpQueries(filters);
    const results = await Promise.all(queries.map(q => fetchPncpByModality(q.url)));

    let allRecords: NormalizedProcess[] = [];
    let totalRecords = 0;

    for (const r of results) {
      allRecords.push(...r.data);
      totalRecords += r.total;
    }

    return { data: allRecords, total: totalRecords };
  } catch (error) {
    console.error("PNCP aggregation error:", error);
    return { data: [], total: 0, error: `Erro ao consultar PNCP: ${error}` };
  }
}

function formatPncpDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

// ============================================================
// COMPRAS.GOV SERVICE (opcional, instável)
// ============================================================

const COMPRAS_GOV_BASE = "http://compras.dados.gov.br/licitacoes/v1";

function normalizeComprasGovRecord(record: any): NormalizedProcess {
  return {
    id: `compras_gov_${record.identificador || record.numero_aviso}`,
    external_id: String(record.identificador || record.numero_aviso || ""),
    source: "COMPRAS_GOV",
    title: record.objeto || "Sem título",
    object_description: record.objeto || "",
    agency: record.uasg_nome || record.nome_orgao || "Não informado",
    government_level: "Federal",
    modality: record.modalidade_licitacao || record.tipo || null,
    estimated_value: record.valor_estimado ? parseFloat(record.valor_estimado) : null,
    is_srp: record.srp === "Sim" || record.srp === true || null,
    state: record.uf || null,
    city: record.municipio || null,
    publication_date: record.data_publicacao || null,
    opening_date: record.data_abertura_proposta || record.data_abertura || null,
    closing_date: record.data_entrega_proposta || null,
    status: record.situacao || record.situacao_aviso || null,
    source_portal: "Compras.gov.br",
    external_url: record.link_licitacao || record.uri_licitacao || null,
  };
}

async function fetchComprasGov(filters: SearchFilters): Promise<{ data: NormalizedProcess[]; total: number; error?: string }> {
  try {
    const params = new URLSearchParams();
    const offset = ((filters.page || 1) - 1) * (filters.pageSize || 20);
    params.set('offset', String(offset));
    params.set('limit', String(filters.pageSize || 20));
    if (filters.uf && filters.uf !== 'all') params.set('uf', filters.uf);

    const url = `${COMPRAS_GOV_BASE}/licitacoes.json?${params.toString()}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) return { data: [], total: 0, error: `Compras.gov retornou status ${resp.status}` };

      const json = await resp.json();
      const resources = json._embedded?.recursos || json.recursos || json._embedded?.licitacoes || [];
      const records = resources.map(normalizeComprasGovRecord);
      return { data: records, total: json.count || json.total || records.length };
    } catch (e) {
      clearTimeout(timeout);
      return { data: [], total: 0, error: `Compras.gov indisponível no momento` };
    }
  } catch (error) {
    return { data: [], total: 0, error: `Compras.gov indisponível no momento` };
  }
}

// ============================================================
// FILTROS LOCAIS (server-side, pós-consulta)
// Necessários porque as APIs externas não suportam todos os filtros
// ============================================================

function applyLocalTextFilters(records: NormalizedProcess[], filters: SearchFilters): NormalizedProcess[] {
  let result = records;

  // Busca textual: normaliza texto (remove acentos, lowercase) e busca em title + description + agency
  if (filters.searchText) {
    const terms = normalizeText(filters.searchText).split(/\s+/).filter(Boolean);
    result = result.filter(r => {
      const text = normalizeText(`${r.title} ${r.object_description} ${r.agency}`);
      return terms.every(t => text.includes(t));
    });
  }

  // Excluir termos
  if (filters.excludeText) {
    const terms = normalizeText(filters.excludeText).split(/\s+/).filter(Boolean);
    result = result.filter(r => {
      const text = normalizeText(`${r.title} ${r.object_description}`);
      return !terms.some(t => text.includes(t));
    });
  }

  // UF (PNCP não filtra por UF nativamente)
  if (filters.uf && filters.uf !== 'all') {
    result = result.filter(r => r.state === filters.uf);
  }

  if (filters.city) {
    const cityNorm = normalizeText(filters.city);
    result = result.filter(r => r.city && normalizeText(r.city).includes(cityNorm));
  }

  if (filters.agency) {
    const agencyNorm = normalizeText(filters.agency);
    result = result.filter(r => normalizeText(r.agency).includes(agencyNorm));
  }

  if (filters.srp === 'sim') {
    result = result.filter(r => r.is_srp === true);
  } else if (filters.srp === 'nao') {
    result = result.filter(r => r.is_srp === false);
  }

  if (filters.minValue != null) {
    result = result.filter(r => r.estimated_value != null && r.estimated_value >= filters.minValue!);
  }
  if (filters.maxValue != null) {
    result = result.filter(r => r.estimated_value != null && r.estimated_value <= filters.maxValue!);
  }

  if (filters.status && filters.status !== 'all') {
    const statusNorm = normalizeText(filters.status);
    result = result.filter(r => r.status && normalizeText(r.status).includes(statusNorm));
  }

  return result;
}

// ============================================================
// DEDUPLICATION
// ============================================================

function dedupeNormalizedProcesses(processes: NormalizedProcess[]): NormalizedProcess[] {
  const seen = new Map<string, NormalizedProcess>();
  for (const p of processes) {
    const key = `${p.source}_${p.external_id}`;
    if (!seen.has(key)) seen.set(key, p);
  }
  return Array.from(seen.values());
}

// ============================================================
// AGGREGATOR
// ============================================================

async function searchPublicProcesses(filters: SearchFilters): Promise<SearchResult> {
  const sources: SearchResult["sources"] = [];
  let allProcesses: NormalizedProcess[] = [];

  // 1. PNCP (fonte principal)
  const pncpResult = await aggregatePncpResults(filters);

  if (pncpResult.error) {
    sources.push({ name: "PNCP", status: "error", message: pncpResult.error });
  } else if (pncpResult.data.length === 0) {
    sources.push({ name: "PNCP", status: "empty", message: "Nenhum resultado no PNCP para o período" });
  } else {
    sources.push({ name: "PNCP", status: "ok" });
    allProcesses.push(...pncpResult.data);
  }

  // 2. Compras.gov (fonte secundária, opcional, não-bloqueante)
  if (COMPRAS_GOV_ENABLED) {
    const cgResult = await fetchComprasGov(filters);
    if (cgResult.error) {
      sources.push({ name: "Compras.gov", status: "error", message: cgResult.error });
    } else if (cgResult.data.length === 0) {
      sources.push({ name: "Compras.gov", status: "empty" });
    } else {
      sources.push({ name: "Compras.gov", status: "ok" });
      allProcesses.push(...cgResult.data);
    }
  } else {
    sources.push({ name: "Compras.gov", status: "disabled", message: "Fonte desabilitada temporariamente" });
  }

  // 3. Deduplicar
  allProcesses = dedupeNormalizedProcesses(allProcesses);

  // 4. Aplicar filtros locais (texto, UF, valor, etc.)
  allProcesses = applyLocalTextFilters(allProcesses, filters);

  // 5. Filtrar apenas processos ativos (recebendo propostas ou closing_date > hoje)
  if (filters.status && filters.status !== 'all') {
    // Já filtrado em applyLocalTextFilters
  } else {
    // Por padrão, priorizar processos abertos/ativos
    const today = new Date().toISOString().substring(0, 10);
    allProcesses = allProcesses.filter(p => {
      if (p.status) {
        const sn = normalizeText(p.status);
        // Excluir encerrados/homologados/revogados/anulados
        if (sn.includes('encerrad') || sn.includes('homologad') || sn.includes('revogad') || sn.includes('anulad')) return false;
      }
      // Se tem closing_date e já passou, excluir
      if (p.closing_date && p.closing_date < today) return false;
      return true;
    });
  }

  // 6. Ordenar por data de fechamento (mais próximas primeiro)
  allProcesses.sort((a, b) => {
    if (!a.closing_date && !b.closing_date) return 0;
    if (!a.closing_date) return 1;
    if (!b.closing_date) return -1;
    return a.closing_date.localeCompare(b.closing_date);
  });

  const demoMode = sources.filter(s => s.status !== 'disabled').every(s => s.status === "error");

  // Paginação: retornar apenas o slice solicitado
  const pageSize = filters.pageSize || 50;
  const page = filters.page || 1;
  //const start = (page - 1) * pageSize;
  //const paginatedData = allProcesses.slice(start, start + pageSize);

  return {
    data: allProcesses, // <- Altere de 'paginatedData' para 'allProcesses'
    totalRecords: allProcesses.length, // Deixe o total dinâmico para a UI saber se pede mais
    page,
    pageSize,
    sources,
    demoMode,
  };
}

// ============================================================
// MAIN HANDLER
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const filters: SearchFilters = req.method === 'POST' 
      ? await req.json()
      : {};

    const result = await searchPublicProcesses(filters);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("search-processes error:", error);
    return new Response(JSON.stringify({ 
      error: "Erro interno ao buscar licitações",
      data: [],
      totalRecords: 0,
      page: 1,
      pageSize: 20,
      sources: [],
      demoMode: true,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
