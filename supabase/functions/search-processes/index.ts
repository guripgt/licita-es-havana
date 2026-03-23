/**
 * Edge Function: search-processes
 * Consulta APIs públicas de licitações no backend com sistema anti-crash.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

const COMPRAS_GOV_ENABLED = false;

interface SearchFilters {
  searchText?: string; excludeText?: string; modality?: string;
  openDateStart?: string; openDateEnd?: string; closeDateStart?: string;
  closeDateEnd?: string; uf?: string; city?: string; agency?: string;
  srp?: string; minValue?: number; maxValue?: number; status?: string;
  page?: number; pageSize?: number;
}

interface NormalizedProcess {
  id: string; external_id: string; source: "PNCP" | "COMPRAS_GOV";
  title: string; object_description: string; agency: string;
  government_level: string | null; modality: string | null;
  estimated_value: number | null; is_srp: boolean | null;
  state: string | null; city: string | null; publication_date: string | null;
  opening_date: string | null; closing_date: string | null;
  status: string | null; source_portal: string | null; external_url: string | null;
}

interface SearchResult {
  data: NormalizedProcess[]; totalRecords: number; page: number; pageSize: number;
  sources: { name: string; status: "ok" | "error" | "empty" | "disabled"; message?: string }[];
  demoMode: boolean;
}

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(str: string): string {
  return removeAccents(str).toLowerCase().trim();
}

const PNCP_BASE = "https://pncp.gov.br/api/consulta";

const PNCP_MODALITY_MAP: Record<string, number> = {
  "Leilão - Eletrônico": 1, "Diálogo Competitivo": 2, "Concorrência - Eletrônica": 3,
  "Concorrência - Presencial": 4, "Pregão Presencial": 5, "Pregão - Presencial": 5,
  "Pregão Eletrônico": 6, "Pregão - Eletrônico": 6, "Dispensa de Licitação": 7,
  "Inexigibilidade": 8, "Leilão - Presencial": 9, "Concorrência": 3, "Leilão": 1,
};

const DEFAULT_MODALITY_CODES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const PNCP_ESFERA_MAP: Record<string, string> = { "F": "Federal", "E": "Estadual", "M": "Municipal", "D": "Distrital" };

function normalizePncpRecord(record: any): NormalizedProcess {
  const orgao = record.orgaoEntidade || {};
  const unidade = record.unidadeOrgao || {};
  const controlePNCP = record.numeroControlePNCP || '';
  
  const cnpj = orgao.cnpj || '';
  const ano = record.anoCompra || '';
  const seq = record.sequencialCompra || '';
  const pncpUrl = (cnpj && ano && seq) ? `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}` : null;

  return {
    id: `pncp_${controlePNCP || `${orgao.cnpj}_${record.anoCompra}_${record.sequencialCompra}`}`,
    external_id: controlePNCP || `${orgao.cnpj}-${record.anoCompra}-${record.sequencialCompra}`,
    source: "PNCP", title: record.objetoCompra || "Sem título", object_description: record.objetoCompra || "",
    agency: orgao.razaoSocial || "Não informado", government_level: PNCP_ESFERA_MAP[orgao.esferaId] || orgao.esferaId || null,
    modality: record.modalidadeNome || null, estimated_value: record.valorTotalEstimado ?? record.valorTotalHomologado ?? null,
    is_srp: record.srp ?? null, state: unidade.ufSigla || null, city: unidade.municipioNome || null,
    publication_date: record.dataPublicacaoPncp ? record.dataPublicacaoPncp.substring(0, 10) : null,
    opening_date: record.dataAberturaProposta ? record.dataAberturaProposta.substring(0, 10) : null,
    closing_date: record.dataEncerramentoProposta || null, status: record.situacaoCompraNome || null,
    source_portal: "PNCP", external_url: record.linkSistemaOrigem || pncpUrl,
  };
}

function buildPncpQueries(filters: SearchFilters): { url: string; modalityCode: number }[] {
  const now = new Date();
  const defaultDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 dias

  const dataInicial = formatPncpDate(filters.openDateStart || filters.closeDateStart || defaultDaysAgo.toISOString().substring(0, 10));
  const dataFinal = formatPncpDate(filters.openDateEnd || filters.closeDateEnd || now.toISOString().substring(0, 10));

  let modalityCodes: number[];
  if (filters.modality && filters.modality !== 'all') {
    const code = PNCP_MODALITY_MAP[filters.modality];
    modalityCodes = code ? [code] : DEFAULT_MODALITY_CODES;
  } else {
    modalityCodes = DEFAULT_MODALITY_CODES;
  }

  const page = filters.page || 1;
  
  // Controle Inteligente de Memória (Anti-Crash):
  // Se busca por texto, pede 150 para achar agulha. Se não, pede 50 padrão, pois UF já filtra na API.
  const hasTextFilter = !!filters.searchText || !!filters.excludeText || !!filters.city || !!filters.agency;
  const tamanhoPagina = hasTextFilter ? 150 : 50; 

  // Filtro nativo de Estado (UF) enviado pro Governo
  const ufParam = (filters.uf && filters.uf !== 'all') ? `&uf=${filters.uf}` : '';

  return modalityCodes.map(code => ({
    url: `${PNCP_BASE}/v1/contratacoes/publicacao?dataInicial=${dataInicial}&dataFinal=${dataFinal}&codigoModalidadeContratacao=${code}&pagina=${page}&tamanhoPagina=${tamanhoPagina}${ufParam}`,
    modalityCode: code,
  }));
}

async function fetchPncpByModality(url: string): Promise<{ data: NormalizedProcess[]; total: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // Limite de 8s para não travar a API Edge

  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return { data: [], total: 0 };
    const json = await resp.json();
    return { data: (json.data || []).map(normalizePncpRecord), total: json.totalRegistros || 0 };
  } catch (e) {
    clearTimeout(timeout);
    return { data: [], total: 0 };
  }
}

async function aggregatePncpResults(filters: SearchFilters): Promise<{ data: NormalizedProcess[]; total: number; error?: string }> {
  try {
    const queries = buildPncpQueries(filters);
    let allRecords: NormalizedProcess[] = [];
    let totalRecords = 0;

    // Sistema de Lotes (Batching) para não afogar o processador
    const batchSize = 4; // Consulta 4 modalidades por vez ao invés das 9 juntas
    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(q => fetchPncpByModality(q.url)));
      for (const r of results) {
        allRecords.push(...r.data);
        totalRecords += r.total;
      }
    }

    return { data: allRecords, total: totalRecords };
  } catch (error) {
    return { data: [], total: 0, error: `Erro ao consultar PNCP: ${error}` };
  }
}

function formatPncpDate(dateStr: string): string { return dateStr.replace(/-/g, ''); }

function applyLocalTextFilters(records: NormalizedProcess[], filters: SearchFilters): NormalizedProcess[] {
  let result = records;
  if (filters.searchText) {
    const terms = normalizeText(filters.searchText).split(/\s+/).filter(Boolean);
    result = result.filter(r => terms.every(t => normalizeText(`${r.title} ${r.object_description} ${r.agency}`).includes(t)));
  }
  if (filters.excludeText) {
    const terms = normalizeText(filters.excludeText).split(/\s+/).filter(Boolean);
    result = result.filter(r => !terms.some(t => normalizeText(`${r.title} ${r.object_description}`).includes(t)));
  }
  if (filters.city) result = result.filter(r => r.city && normalizeText(r.city).includes(normalizeText(filters.city!)));
  if (filters.agency) result = result.filter(r => normalizeText(r.agency).includes(normalizeText(filters.agency!)));
  if (filters.srp === 'sim') result = result.filter(r => r.is_srp === true);
  else if (filters.srp === 'nao') result = result.filter(r => r.is_srp === false);
  if (filters.minValue != null) result = result.filter(r => r.estimated_value != null && r.estimated_value >= filters.minValue!);
  if (filters.maxValue != null) result = result.filter(r => r.estimated_value != null && r.estimated_value <= filters.maxValue!);
  if (filters.status && filters.status !== 'all') result = result.filter(r => r.status && normalizeText(r.status).includes(normalizeText(filters.status!)));
  
  return result;
}

function dedupeNormalizedProcesses(processes: NormalizedProcess[]): NormalizedProcess[] {
  const seen = new Map<string, NormalizedProcess>();
  for (const p of processes) { seen.set(`${p.source}_${p.external_id}`, p); }
  return Array.from(seen.values());
}

async function searchPublicProcesses(filters: SearchFilters): Promise<SearchResult> {
  const sources: SearchResult["sources"] = [];
  let allProcesses: NormalizedProcess[] = [];
  let rawTotalRecords = 0;

  const pncpResult = await aggregatePncpResults(filters);

  if (pncpResult.error) sources.push({ name: "PNCP", status: "error", message: pncpResult.error });
  else if (pncpResult.data.length === 0) sources.push({ name: "PNCP", status: "empty", message: "Nenhum resultado" });
  else {
    sources.push({ name: "PNCP", status: "ok" });
    allProcesses.push(...pncpResult.data);
    rawTotalRecords += pncpResult.total;
  }

  sources.push({ name: "Compras.gov", status: "disabled", message: "Fonte desabilitada" });

  allProcesses = dedupeNormalizedProcesses(allProcesses);
  allProcesses = applyLocalTextFilters(allProcesses, filters);

  if (!filters.status || filters.status === 'all') {
    const today = new Date().toISOString().substring(0, 10);
    allProcesses = allProcesses.filter(p => {
      if (p.status) {
        const sn = normalizeText(p.status);
        if (sn.includes('encerrad') || sn.includes('homologad') || sn.includes('revogad') || sn.includes('anulad')) return false;
      }
      if (p.closing_date && p.closing_date < today) return false;
      return true;
    });
  }

  allProcesses.sort((a, b) => {
    if (!a.closing_date && !b.closing_date) return 0;
    if (!a.closing_date) return 1;
    if (!b.closing_date) return -1;
    return a.closing_date.localeCompare(b.closing_date);
  });

  const demoMode = sources.filter(s => s.status !== 'disabled').every(s => s.status === "error");

  return {
    data: allProcesses,
    totalRecords: rawTotalRecords > 0 ? rawTotalRecords : allProcesses.length,
    page: filters.page || 1,
    pageSize: filters.pageSize || 50,
    sources,
    demoMode,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  
  try {
    const bodyText = await req.text();
    const filters: SearchFilters = req.method === 'POST' && bodyText ? JSON.parse(bodyText) : {};
    
    const result = await searchPublicProcesses(filters);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error("Critical edge function error:", error);
    return new Response(JSON.stringify({ error: "Erro crítico no servidor", data: [], totalRecords: 0, page: 1, pageSize: 50, sources: [], demoMode: true }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
