/**
 * Edge Function: search-processes
 * 
 * Consulta APIs públicas de licitações (PNCP e Compras.gov) no backend,
 * normaliza os resultados e retorna formato unificado.
 * 
 * ENDPOINTS UTILIZADOS:
 * - PNCP: https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao
 *   Params: dataInicial, dataFinal (YYYYMMDD), codigoModalidadeContratacao, pagina, tamanhoPagina (min 10)
 *   Obs: codigoModalidadeContratacao é obrigatório. Quando não filtrado, iteramos múltiplos códigos.
 * 
 * - Compras.gov (Dados Abertos legacy): http://compras.dados.gov.br/licitacoes/v1/licitacoes.json
 *   Params: offset, limit, uasg, modalidade, uf, etc.
 *   Obs: API instável, frequentemente retorna 503. Implementado com fallback.
 * 
 * FILTROS ADAPTADOS:
 * - PNCP: texto do objeto → filtrado client-side após consulta (API não suporta full-text search)
 * - PNCP: UF → filtrado client-side (API não tem param de UF na publicação)
 * - PNCP: valor mínimo/máximo → filtrado client-side
 * - PNCP: cidade, órgão → filtrado client-side
 * - ComprasGov: maioria dos filtros suportados nativamente, mas API instável
 * 
 * LIMITAÇÕES:
 * - PNCP exige range de data (max 30 dias) e codigoModalidadeContratacao
 * - ComprasGov frequentemente timeout/503
 * - Sem full-text search nativo nas APIs — filtro de texto feito server-side
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  srp?: string; // "sim" | "nao" | "all"
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
  sources: { name: string; status: "ok" | "error" | "empty"; message?: string }[];
  demoMode: boolean;
}

// ============================================================
// PNCP SERVICE
// ============================================================

const PNCP_BASE = "https://pncp.gov.br/api/consulta";

// Modalidade codes for PNCP
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

// Default modalities to search when none specified
const DEFAULT_MODALITY_CODES = [3, 5, 6, 7, 8];

const PNCP_ESFERA_MAP: Record<string, string> = {
  "F": "Federal",
  "E": "Estadual",
  "M": "Municipal",
  "D": "Distrital",
  "N": "Municipal", // N appears in some records for municipal
};

function normalizePncpRecord(record: any): NormalizedProcess {
  const orgao = record.orgaoEntidade || {};
  const unidade = record.unidadeOrgao || {};
  
  return {
    id: `pncp_${record.numeroControlePNCP || `${orgao.cnpj}_${record.anoCompra}_${record.sequencialCompra}`}`,
    external_id: record.numeroControlePNCP || `${orgao.cnpj}-${record.anoCompra}-${record.sequencialCompra}`,
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
    external_url: record.linkSistemaOrigem || `https://pncp.gov.br/app/editais/${record.numeroControlePNCP}`,
  };
}

async function fetchPncp(filters: SearchFilters): Promise<{ data: NormalizedProcess[]; total: number; error?: string }> {
  try {
    // Determine date range (default: last 15 days)
    const now = new Date();
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    
    const dataInicial = (filters.openDateStart || filters.closeDateStart)
      ? formatPncpDate(filters.openDateStart || filters.closeDateStart || fifteenDaysAgo.toISOString().substring(0, 10))
      : formatPncpDate(fifteenDaysAgo.toISOString().substring(0, 10));
    
    const dataFinal = (filters.openDateEnd || filters.closeDateEnd)
      ? formatPncpDate(filters.openDateEnd || filters.closeDateEnd || now.toISOString().substring(0, 10))
      : formatPncpDate(now.toISOString().substring(0, 10));

    // Determine modality codes
    let modalityCodes: number[] = [];
    if (filters.modality && filters.modality !== 'all') {
      const code = PNCP_MODALITY_MAP[filters.modality];
      if (code) modalityCodes = [code];
      else modalityCodes = DEFAULT_MODALITY_CODES;
    } else {
      modalityCodes = DEFAULT_MODALITY_CODES;
    }

    const page = filters.page || 1;
    const tamanhoPagina = Math.max(10, filters.pageSize || 20);

    // Fetch from each modality (PNCP requires this param)
    // To be efficient, only fetch first modality code and paginate, unless we need all
    let allRecords: NormalizedProcess[] = [];
    let totalRecords = 0;

    // If specific modality, fetch just that one; otherwise fetch top 2-3 for speed
    const codesToFetch = modalityCodes.length === 1 ? modalityCodes : modalityCodes.slice(0, 3);
    
    const fetchPromises = codesToFetch.map(async (code) => {
      const url = `${PNCP_BASE}/v1/contratacoes/publicacao?dataInicial=${dataInicial}&dataFinal=${dataFinal}&codigoModalidadeContratacao=${code}&pagina=${page}&tamanhoPagina=${tamanhoPagina}`;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      
      try {
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        
        if (!resp.ok) {
          console.error(`PNCP error for modality ${code}: ${resp.status}`);
          return { data: [], total: 0 };
        }
        
        const json = await resp.json();
        const records = (json.data || []).map(normalizePncpRecord);
        return { data: records, total: json.totalRegistros || 0 };
      } catch (e) {
        clearTimeout(timeout);
        console.error(`PNCP fetch failed for modality ${code}:`, e);
        return { data: [], total: 0 };
      }
    });

    const results = await Promise.all(fetchPromises);
    for (const r of results) {
      allRecords.push(...r.data);
      totalRecords += r.total;
    }

    // Apply client-side filters that PNCP API doesn't support natively
    allRecords = applyClientFilters(allRecords, filters);

    return { data: allRecords, total: totalRecords };
  } catch (error) {
    console.error("PNCP service error:", error);
    return { data: [], total: 0, error: `Erro ao consultar PNCP: ${error}` };
  }
}

function formatPncpDate(dateStr: string): string {
  // Convert YYYY-MM-DD to YYYYMMDD
  return dateStr.replace(/-/g, '');
}

// ============================================================
// COMPRAS.GOV SERVICE
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
    government_level: "Federal", // Compras.gov is federal only
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
    if (filters.agency) params.set('uasg_nome', filters.agency);
    
    const url = `${COMPRAS_GOV_BASE}/licitacoes.json?${params.toString()}`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    try {
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (!resp.ok) {
        console.error(`ComprasGov error: ${resp.status}`);
        return { data: [], total: 0, error: `Compras.gov retornou status ${resp.status}` };
      }
      
      const json = await resp.json();
      const resources = json._embedded?.recursos || json.recursos || json._embedded?.licitacoes || [];
      const records = resources.map(normalizeComprasGovRecord);
      const filtered = applyClientFilters(records, filters);
      const total = json.count || json.total || filtered.length;
      
      return { data: filtered, total };
    } catch (e) {
      clearTimeout(timeout);
      console.error("ComprasGov fetch error:", e);
      return { data: [], total: 0, error: `Compras.gov indisponível: ${e}` };
    }
  } catch (error) {
    console.error("ComprasGov service error:", error);
    return { data: [], total: 0, error: `Erro ao consultar Compras.gov: ${error}` };
  }
}

// ============================================================
// CLIENT-SIDE FILTERING (for filters not supported by source APIs)
// ============================================================

function applyClientFilters(records: NormalizedProcess[], filters: SearchFilters): NormalizedProcess[] {
  let result = records;

  if (filters.searchText) {
    const terms = filters.searchText.toLowerCase().split(/\s+/);
    result = result.filter(r => {
      const text = `${r.title} ${r.object_description} ${r.agency}`.toLowerCase();
      return terms.every(t => text.includes(t));
    });
  }

  if (filters.excludeText) {
    const terms = filters.excludeText.toLowerCase().split(/\s+/);
    result = result.filter(r => {
      const text = `${r.title} ${r.object_description}`.toLowerCase();
      return !terms.some(t => text.includes(t));
    });
  }

  if (filters.uf && filters.uf !== 'all') {
    result = result.filter(r => r.state === filters.uf);
  }

  if (filters.city) {
    const cityLower = filters.city.toLowerCase();
    result = result.filter(r => r.city?.toLowerCase().includes(cityLower));
  }

  if (filters.agency) {
    const agencyLower = filters.agency.toLowerCase();
    result = result.filter(r => r.agency.toLowerCase().includes(agencyLower));
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
    const statusLower = filters.status.toLowerCase();
    result = result.filter(r => r.status?.toLowerCase().includes(statusLower));
  }

  return result;
}

// ============================================================
// DEDUPLICATION
// ============================================================

function deduplicateProcesses(processes: NormalizedProcess[]): NormalizedProcess[] {
  const seen = new Map<string, NormalizedProcess>();
  
  for (const p of processes) {
    // Try to detect duplicates by external_id + source, or by similar title + agency
    const key = `${p.source}_${p.external_id}`;
    if (!seen.has(key)) {
      seen.set(key, p);
    }
  }
  
  return Array.from(seen.values());
}

// ============================================================
// AGGREGATOR: searchPublicProcesses
// ============================================================

async function searchPublicProcesses(filters: SearchFilters): Promise<SearchResult> {
  const sources: SearchResult["sources"] = [];
  let allProcesses: NormalizedProcess[] = [];
  let demoMode = false;

  // Fetch from all sources in parallel
  const [pncpResult, comprasGovResult] = await Promise.all([
    fetchPncp(filters),
    fetchComprasGov(filters),
  ]);

  // Process PNCP results
  if (pncpResult.error) {
    sources.push({ name: "PNCP", status: "error", message: pncpResult.error });
  } else if (pncpResult.data.length === 0) {
    sources.push({ name: "PNCP", status: "empty", message: "Nenhum resultado encontrado no PNCP" });
  } else {
    sources.push({ name: "PNCP", status: "ok" });
    allProcesses.push(...pncpResult.data);
  }

  // Process Compras.gov results
  if (comprasGovResult.error) {
    sources.push({ name: "Compras.gov", status: "error", message: comprasGovResult.error });
  } else if (comprasGovResult.data.length === 0) {
    sources.push({ name: "Compras.gov", status: "empty", message: "Nenhum resultado encontrado no Compras.gov" });
  } else {
    sources.push({ name: "Compras.gov", status: "ok" });
    allProcesses.push(...comprasGovResult.data);
  }

  // If both sources failed, enter demo mode with fallback to local DB
  if (sources.every(s => s.status === "error")) {
    demoMode = true;
  }

  // Deduplicate
  allProcesses = deduplicateProcesses(allProcesses);

  // Sort by closing date (ascending, nulls last)
  allProcesses.sort((a, b) => {
    if (!a.closing_date && !b.closing_date) return 0;
    if (!a.closing_date) return 1;
    if (!b.closing_date) return -1;
    return a.closing_date.localeCompare(b.closing_date);
  });

  return {
    data: allProcesses,
    totalRecords: pncpResult.total + comprasGovResult.total,
    page: filters.page || 1,
    pageSize: filters.pageSize || 20,
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

    // If demo mode, try to fallback to local seeded data
    if (result.demoMode) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        let query = supabase.from('public_processes').select('*').order('closing_date', { ascending: true }).limit(50);
        
        if (filters.searchText) query = query.ilike('title', `%${filters.searchText}%`);
        if (filters.uf && filters.uf !== 'all') query = query.eq('state', filters.uf);
        if (filters.modality && filters.modality !== 'all') query = query.eq('modality', filters.modality);
        
        const { data: localData } = await query;
        
        if (localData && localData.length > 0) {
          result.data = localData.map(r => ({
            id: r.id,
            external_id: r.external_id || r.id,
            source: (r.source as "PNCP" | "COMPRAS_GOV") || "PNCP",
            title: r.title,
            object_description: r.object_description || "",
            agency: r.agency || "",
            government_level: r.government_level || null,
            modality: r.modality || null,
            estimated_value: r.estimated_value || null,
            is_srp: r.is_srp || null,
            state: r.state || null,
            city: r.city || null,
            publication_date: r.publication_date || null,
            opening_date: r.opening_date || null,
            closing_date: r.closing_date || null,
            status: r.status || null,
            source_portal: r.source_portal || null,
            external_url: r.external_url || null,
          }));
          result.totalRecords = localData.length;
          result.sources.push({ name: "Banco Local (fallback)", status: "ok", message: "Dados de demonstração" });
        }
      } catch (e) {
        console.error("Fallback to local DB failed:", e);
      }
    }

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
