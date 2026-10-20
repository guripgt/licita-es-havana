import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildSearchUrl, normalizeSearchItem, fetchSearchPage, createPortalSearch } from './pncpSearch';
import { createSearch } from './search';

const today = new Date('2026-10-19T12:00:00');

function jsonResponse(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

afterEach(() => vi.unstubAllGlobals());

function params(url: string) {
  const u = new URL(url);
  return { path: u.pathname, p: u.searchParams };
}

describe('buildSearchUrl', () => {
  it('monta a busca do portal com palavra, UF e situação aberta', () => {
    const { path, p } = params(buildSearchUrl({ searchText: 'panetone', uf: 'GO' }, 1));
    expect(path).toBe('/api/search/');
    expect(p.get('q')).toBe('panetone');
    expect(p.get('tipos_documento')).toBe('edital');
    expect(p.get('ordenacao')).toBe('-data');
    expect(p.get('status')).toBe('recebendo_proposta');
    expect(p.get('ufs')).toBe('GO');
    expect(p.get('pagina')).toBe('1');
    expect(p.get('tam_pagina')).toBe('100');
    expect(p.has('modalidades')).toBe(false);
  });

  it('não manda termos excluídos ao portal (lá o "-" não exclui) e aplica modalidade', () => {
    const { p } = params(buildSearchUrl({ searchText: 'material limpeza', excludeText: 'obra reforma', modality: 6 }, 2));
    expect(p.get('q')).toBe('material limpeza');
    expect(p.get('modalidades')).toBe('6');
    expect(p.get('pagina')).toBe('2');
    expect(p.has('ufs')).toBe(false);
  });

  it('mantém frases entre aspas', () => {
    const { p } = params(buildSearchUrl({ searchText: '  "material de limpeza"   escolar ' }, 1));
    expect(p.get('q')).toBe('"material de limpeza" escolar');
  });

  it('mapeia cada situação para o status do portal', () => {
    const status = (situation: any) => params(buildSearchUrl({ situation }, 1)).p.get('status');
    expect(status('abertas')).toBe('recebendo_proposta');
    expect(status('julgamento')).toBe('propostas_encerradas');
    expect(status('encerradas')).toBe('encerradas');
    expect(status('revogadas')).toBe('todos');
    expect(status('todas')).toBe('todos');
  });
});

describe('normalizeSearchItem', () => {
  const item = {
    title: 'Edital nº 000000552026/2026',
    description: 'FORNECIMENTO DE CESTAS NATALINAS COM PANETONE',
    item_url: '/compras/01815216000178/2026/183',
    numero_controle_pncp: '01815216000178-1-000183/2026',
    orgao_nome: 'FESURV - UNIVERSIDADE DE RIO VERDE',
    esfera_id: 'M',
    municipio_nome: 'Rio Verde',
    uf: 'GO',
    modalidade_licitacao_nome: 'Pregão - Eletrônico',
    situacao_id: '1',
    situacao_nome: 'Divulgada no PNCP',
    data_publicacao_pncp: '2026-10-09T16:41:08.948242664',
    data_inicio_vigencia: '2026-10-19T07:00',
    data_fim_vigencia: '2026-11-03T08:29',
    srp: false,
    valor_total_estimado: 679552,
    valor_total_homologado: null,
    link_sistema_origem: 'https://bnccompras.com/x',
  };

  it('usa o mesmo id da API de consulta e os campos do edital', () => {
    const r = normalizeSearchItem(item);
    expect(r.id).toBe('pncp_01815216000178-1-000183/2026');
    expect(r.external_id).toBe('01815216000178-1-000183/2026');
    expect(r.source).toBe('PNCP');
    expect(r.title).toBe('FORNECIMENTO DE CESTAS NATALINAS COM PANETONE');
    expect(r.agency).toBe('FESURV - UNIVERSIDADE DE RIO VERDE');
    expect(r.government_level).toBe('Municipal');
    expect(r.city).toBe('Rio Verde');
    expect(r.state).toBe('GO');
    expect(r.modality).toBe('Pregão - Eletrônico');
    expect(r.status_id).toBe(1);
    expect(r.publication_date).toBe('2026-10-09');
    expect(r.opening_date).toBe('2026-10-19T07:00');
    expect(r.closing_date).toBe('2026-11-03T08:29');
    expect(r.estimated_value).toBe(679552);
    expect(r.is_srp).toBe(false);
    expect(r.external_url).toBe('https://pncp.gov.br/app/editais/01815216000178/2026/183');
  });

  it('usa a informação complementar como descrição do objeto', () => {
    const r = normalizeSearchItem({ ...item, informacao_complementar: 'Itens: panetone 500g' });
    expect(r.title).toBe('FORNECIMENTO DE CESTAS NATALINAS COM PANETONE');
    expect(r.object_description).toBe('Itens: panetone 500g');
  });

  it('trata datas vazias como ausentes', () => {
    const r = normalizeSearchItem({ ...item, data_inicio_vigencia: '', data_fim_vigencia: null });
    expect(r.opening_date).toBeNull();
    expect(r.closing_date).toBeNull();
  });
});

describe('fetchSearchPage', () => {
  it('pede JSON e devolve itens e total', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(200, { items: [{ numero_controle_pncp: 'a', item_url: '/compras/1/2026/1' }], total: 2 }));
    vi.stubGlobal('fetch', f);
    const page = await fetchSearchPage('https://x');
    expect(page.total).toBe(2);
    expect(page.data).toHaveLength(1);
    expect(f.mock.calls[0][1].headers.Accept).toBe('application/json');
  });

  it('tenta de novo quando o servidor derruba a conexão', async () => {
    vi.useFakeTimers();
    const f = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { items: [], total: 0 }));
    vi.stubGlobal('fetch', f);
    const result = fetchSearchPage('https://x');
    await vi.advanceTimersByTimeAsync(300 + 1000);
    await expect(result).resolves.toMatchObject({ total: 0 });
    expect(f).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('rejeita resposta em formato inesperado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { foo: 1 })));
    await expect(fetchSearchPage('https://x')).rejects.toThrow('Resposta inesperada da busca do PNCP');
  });
});

const portalItem = (n: string, over: Record<string, unknown> = {}) => ({
  numero_controle_pncp: n, item_url: `/compras/1/2026/${n}`, description: `Objeto ${n}`, situacao_id: '1', uf: 'GO', ...over,
});

function stubSearch(handler: (page: number, url: URL) => Response) {
  const f = vi.fn().mockImplementation(async (url: string) => {
    const u = new URL(url);
    return handler(Number(u.searchParams.get('pagina')), u);
  });
  vi.stubGlobal('fetch', f);
  return f;
}

describe('createPortalSearch', () => {
  it('lê uma página por vez quando não há filtro local', async () => {
    const f = stubSearch(page => jsonResponse(200, { items: [portalItem(`p${page}`)], total: 250 }));
    const search = createPortalSearch({ searchText: 'panetone' }, today);
    const first = await search.next();
    expect(f).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ total: 250, scanned: 1, hasMore: true, mode: 'busca', exact: true });
    expect(first.sources[0].status).toBe('ok');
    await search.next();
    await search.next();
    const last = await search.next();
    expect(f).toHaveBeenCalledTimes(3);
    expect(last.hasMore).toBe(false);
  });

  it('aplica a exclusão de termos e frases no navegador', async () => {
    stubSearch(() => jsonResponse(200, {
      items: [
        portalItem('a', { description: 'Material de limpeza' }),
        portalItem('b', { description: 'Material de limpeza e produtos químicos' }),
        portalItem('c', { description: 'Material de limpeza para obra' }),
      ],
      total: 3,
    }));
    const batch = await createPortalSearch({ searchText: 'limpeza', excludeText: '"produtos químicos" obra' }, today).next();
    expect(batch.data.map(p => p.external_id)).toEqual(['a']);
    expect(batch.exact).toBe(false);
  });

  it('não refiltra localmente o texto já buscado no servidor', async () => {
    stubSearch(() => jsonResponse(200, { items: [portalItem('a', { description: 'Cestas natalinas' })], total: 1 }));
    const batch = await createPortalSearch({ searchText: 'panetone' }, today).next();
    expect(batch.data).toHaveLength(1);
  });

  it('com filtro local, continua lendo páginas até achar resultados', async () => {
    const f = stubSearch(page => jsonResponse(200, {
      items: [portalItem(`p${page}`, { municipio_nome: page === 3 ? 'Goiânia' : 'Anápolis' })], total: 500,
    }));
    const batch = await createPortalSearch({ city: 'goiania' }, today).next();
    expect(f).toHaveBeenCalledTimes(5);
    expect(batch.data.map(p => p.external_id)).toEqual(['p3']);
    expect(batch.exact).toBe(false);
  });

  it('revogadas: busca todos no servidor e filtra pela situação', async () => {
    const f = stubSearch(() => jsonResponse(200, {
      items: [portalItem('a', { situacao_id: '2' }), portalItem('b', { situacao_id: '1' })], total: 2,
    }));
    const batch = await createPortalSearch({ situation: 'revogadas' }, today).next();
    expect(new URL(f.mock.calls[0][0]).searchParams.get('status')).toBe('todos');
    expect(batch.data.map(p => p.external_id)).toEqual(['a']);
  });
});

describe('limite de 10.000 resultados do portal', () => {
  it('não pede páginas além do limite e avisa para refinar', async () => {
    const f = stubSearch(page => jsonResponse(200, { items: [portalItem(`p${page}`, { municipio_nome: 'Anápolis' })], total: 38236 }));
    const search = createPortalSearch({ city: 'goiania' }, today);
    let batch;
    for (let i = 0; i < 6; i++) batch = await search.next();
    expect(f).toHaveBeenCalledTimes(100);
    expect(batch!.hasMore).toBe(false);
    expect(batch!.sources[0].message).toMatch(/10\.000 primeiros resultados/);
  });
});

describe('itens sem número de controle', () => {
  it('são ignorados', async () => {
    stubSearch(() => jsonResponse(200, { items: [portalItem('a'), { description: 'sem controle' }], total: 2 }));
    const batch = await createPortalSearch({}, today).next();
    expect(batch.data.map(p => p.external_id)).toEqual(['a']);
  });
});

describe('createSearch (com plano B)', () => {
  it('usa a busca do portal quando ela responde', async () => {
    const f = stubSearch(() => jsonResponse(200, { items: [portalItem('a')], total: 1 }));
    const batch = await createSearch({ searchText: 'panetone', uf: 'GO' }, today).next();
    expect(batch.mode).toBe('busca');
    expect(new URL(f.mock.calls[0][0]).pathname).toBe('/api/search/');
  });

  it('usa a API oficial para período de publicação e para revogadas', async () => {
    const f = stubSearch(() => jsonResponse(200, { data: [], totalRegistros: 0, totalPaginas: 0 }));
    await createSearch({ situation: 'encerradas', pubDateStart: '2025-01-01', pubDateEnd: '2025-03-31', modality: 6 }, today).next();
    await createSearch({ situation: 'revogadas', modality: 6 }, today).next();
    for (const call of f.mock.calls) expect(new URL(call[0]).pathname).toMatch(/^\/api\/consulta\//);
  });

  it('com palavra-chave, período de publicação continua na busca do portal', async () => {
    const f = stubSearch(() => jsonResponse(200, { items: [], total: 0 }));
    await createSearch({ searchText: 'panetone', situation: 'encerradas', pubDateStart: '2025-10-01', pubDateEnd: '2025-12-31' }, today).next();
    expect(new URL(f.mock.calls[0][0]).pathname).toBe('/api/search/');
  });

  it('chamadas simultâneas na primeira página não criam duas buscas', async () => {
    const f = stubSearch(() => jsonResponse(200, { items: [portalItem('a')], total: 1 }));
    const search = createSearch({ searchText: 'x' }, today);
    await Promise.all([search.next(), search.next()]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('cai para a API de consulta quando a busca do portal falha', async () => {
    const f = vi.fn().mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.pathname === '/api/search/') return jsonResponse(500, { message: 'fora do ar' });
      return jsonResponse(200, {
        data: [{ numeroControlePNCP: 'c1', objetoCompra: 'Panetone natalino', situacaoCompraId: 1, unidadeOrgao: { ufSigla: 'GO' } }],
        totalRegistros: 1, totalPaginas: 1,
      });
    });
    vi.stubGlobal('fetch', f);
    const batch = await createSearch({ searchText: 'panetone', uf: 'GO', modality: 6 }, today).next();
    expect(batch.mode).toBe('consulta');
    expect(batch.data.map(p => p.external_id)).toEqual(['c1']);
    expect(batch.sources[0].message).toMatch(/modo alternativo/);
  });
});
