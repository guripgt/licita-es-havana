import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildPncpUrl, normalizePncpRecord, fetchPncpPage, PNCP_MODALITIES, applyLocalFilters, validateFilters, createConsultaSearch as createSearch } from './pncp';
import type { NormalizedProcess } from '@/types/processes';

const today = new Date('2026-10-19T12:00:00');

function parse(url: string) {
  const u = new URL(url);
  return { path: u.pathname, p: u.searchParams };
}

function jsonResponse(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

afterEach(() => vi.unstubAllGlobals());

describe('buildPncpUrl', () => {
  it('usa /proposta com dataFinal de hoje + 365 dias por padrão', () => {
    const { path, p } = parse(buildPncpUrl({}, 6, 1, today));
    expect(path).toBe('/api/consulta/v1/contratacoes/proposta');
    expect(p.get('dataFinal')).toBe('20271019');
    expect(p.get('codigoModalidadeContratacao')).toBe('6');
    expect(p.get('pagina')).toBe('1');
    expect(p.get('tamanhoPagina')).toBe('50');
    expect(p.has('uf')).toBe(false);
  });

  it('aplica UF, fechamento (fim) e página', () => {
    const { p } = parse(buildPncpUrl({ uf: 'SP', closeDateEnd: '2026-12-31' }, 6, 2, today));
    expect(p.get('uf')).toBe('SP');
    expect(p.get('dataFinal')).toBe('20261231');
    expect(p.get('pagina')).toBe('2');
  });

  it('usa /publicacao com o período de publicação quando situação não é abertas', () => {
    const { path, p } = parse(buildPncpUrl({ situation: 'todas', pubDateStart: '2026-07-01', pubDateEnd: '2026-09-30' }, 8, 1, today));
    expect(path).toBe('/api/consulta/v1/contratacoes/publicacao');
    expect(p.get('dataInicial')).toBe('20260701');
    expect(p.get('dataFinal')).toBe('20260930');
  });

  it('usa os últimos 90 dias de publicação por padrão', () => {
    const { p } = parse(buildPncpUrl({ situation: 'encerradas' }, 8, 1, today));
    expect(p.get('dataInicial')).toBe('20260721');
    expect(p.get('dataFinal')).toBe('20261019');
  });
});

describe('normalizePncpRecord', () => {
  const fixture = {
    orgaoEntidade: { cnpj: '08778268000160', razaoSocial: 'SES', esferaId: 'E' },
    unidadeOrgao: { ufSigla: 'SP', municipioNome: 'São Paulo' },
    anoCompra: 2026,
    sequencialCompra: 627,
    numeroControlePNCP: '08778268000160-1-000627/2026',
    objetoCompra: 'Aquisição de equipamentos',
    modalidadeNome: 'Pregão - Eletrônico',
    situacaoCompraId: 1,
    situacaoCompraNome: 'Divulgada no PNCP',
    valorTotalEstimado: 1000,
    valorTotalHomologado: 900,
    linkSistemaOrigem: null,
    srp: false,
    dataPublicacaoPncp: '2026-10-10T02:00:11',
    dataAberturaProposta: '2026-10-11T08:00:00',
    dataEncerramentoProposta: '2026-11-01T09:00:00',
  };

  it('normaliza campos e monta link do PNCP', () => {
    const r = normalizePncpRecord(fixture);
    expect(r.id).toBe('pncp_08778268000160-1-000627/2026');
    expect(r.external_id).toBe('08778268000160-1-000627/2026');
    expect(r.external_url).toBe('https://pncp.gov.br/app/editais/08778268000160/2026/627');
    expect(r.estimated_value).toBe(1000);
    expect(r.homologated_value).toBe(900);
    expect(r.status_id).toBe(1);
    expect(r.state).toBe('SP');
    expect(r.city).toBe('São Paulo');
    expect(r.government_level).toBe('Estadual');
    expect(r.closing_date).toBe('2026-11-01T09:00:00');
    expect(r.publication_date).toBe('2026-10-10');
  });
});

describe('fetchPncpPage', () => {
  it('trata 204 como página vazia', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(204)));
    await expect(fetchPncpPage('https://x')).resolves.toEqual({ data: [], totalRegistros: 0, totalPaginas: 0 });
  });

  it('rejeita com a mensagem da API após nova tentativa', async () => {
    const f = vi.fn().mockImplementation(async () => jsonResponse(400, { message: 'Tamanho de página inválido' }));
    vi.stubGlobal('fetch', f);
    await expect(fetchPncpPage('https://x')).rejects.toThrow('Tamanho de página inválido');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('trata falha de rede como limite (429 do PNCP vem sem CORS) e espera antes de repetir', async () => {
    vi.useFakeTimers();
    const f = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { data: [], totalRegistros: 3, totalPaginas: 1 }));
    vi.stubGlobal('fetch', f);
    const result = fetchPncpPage('https://x');
    await vi.advanceTimersByTimeAsync(2999);
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1 + 6000);
    await expect(result).resolves.toMatchObject({ totalRegistros: 3, totalPaginas: 1 });
    vi.useRealTimers();
  });
});

describe('fetchPncpPage com limite de requisições (429)', () => {
  afterEach(() => vi.useRealTimers());

  it('espera e tenta de novo até o PNCP liberar', async () => {
    vi.useFakeTimers();
    const f = vi.fn()
      .mockResolvedValueOnce(jsonResponse(429))
      .mockResolvedValueOnce(jsonResponse(429))
      .mockResolvedValueOnce(jsonResponse(200, { data: [], totalRegistros: 5, totalPaginas: 1 }));
    vi.stubGlobal('fetch', f);
    const result = fetchPncpPage('https://x');
    await vi.advanceTimersByTimeAsync(3000);
    expect(f).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(6000);
    await expect(result).resolves.toMatchObject({ totalRegistros: 5 });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('desiste após 3 esperas com mensagem clara', async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockImplementation(async () => jsonResponse(429));
    vi.stubGlobal('fetch', f);
    const result = fetchPncpPage('https://x');
    const assertion = expect(result).rejects.toThrow('PNCP limitou as consultas');
    await vi.advanceTimersByTimeAsync(3000 + 6000 + 12000);
    await assertion;
    expect(f).toHaveBeenCalledTimes(4);
  });
});

describe('fetchPncpPage sem internet', () => {
  it('falha na hora, sem esperar, quando o navegador está offline', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await expect(fetchPncpPage('https://x')).rejects.toThrow('Sem conexão com a internet.');
    expect(f).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('PNCP_MODALITIES', () => {
  it('tem os 13 códigos oficiais', () => {
    expect(PNCP_MODALITIES.map(m => m.code)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
});

function proc(over: Partial<NormalizedProcess>): NormalizedProcess {
  return {
    id: 'pncp_x', external_id: 'x', source: 'PNCP', title: 'Item', object_description: '', agency: 'Órgão',
    government_level: null, modality: null, estimated_value: 100, homologated_value: null, is_srp: false,
    state: 'SP', city: 'São Paulo', publication_date: null, opening_date: null, closing_date: null,
    status: null, status_id: 1, source_portal: 'PNCP', external_url: null, ...over,
  };
}

describe('applyLocalFilters', () => {
  const now = new Date('2026-10-19T12:00:00');

  it('casa palavras sem acento nem caixa', () => {
    const list = [proc({ id: 'a', title: 'PREGÃO ELETRÔNICO para cadeiras' }), proc({ id: 'b', title: 'Concurso' })];
    expect(applyLocalFilters(list, { searchText: 'pregao eletronico' }, now).map(p => p.id)).toEqual(['a']);
  });

  it('aceita frase entre aspas (modo alternativo)', () => {
    const list = [proc({ id: 'a', title: 'Material de limpeza e higiene' }), proc({ id: 'b', title: 'Limpeza de material' })];
    expect(applyLocalFilters(list, { searchText: '"material de limpeza"' }, now).map(p => p.id)).toEqual(['a']);
  });

  it('exclui termos', () => {
    const list = [proc({ id: 'a', title: 'Obra de reforma' }), proc({ id: 'b', title: 'Cadeiras' })];
    expect(applyLocalFilters(list, { excludeText: 'obra' }, now).map(p => p.id)).toEqual(['b']);
  });

  it('valor mínimo descarta valor nulo', () => {
    const list = [proc({ id: 'a', estimated_value: null }), proc({ id: 'b', estimated_value: 600 })];
    expect(applyLocalFilters(list, { minValue: 500 }, now).map(p => p.id)).toEqual(['b']);
  });

  it('filtra SRP e cidade', () => {
    const list = [proc({ id: 'a', is_srp: true }), proc({ id: 'b', is_srp: false }), proc({ id: 'c', is_srp: true, city: 'Campinas' })];
    expect(applyLocalFilters(list, { srp: 'sim', city: 'sao paulo' }, now).map(p => p.id)).toEqual(['a']);
  });

  it('filtra por situação', () => {
    const list = [
      proc({ id: 'aberta', status_id: 1, closing_date: '2026-11-01T09:00:00' }),
      proc({ id: 'encerrada', status_id: 1, closing_date: '2026-10-01T09:00:00' }),
      proc({ id: 'rev', status_id: 2 }), proc({ id: 'anu', status_id: 3 }), proc({ id: 'sus', status_id: 4 }),
    ];
    const ids = (situation: any) => applyLocalFilters(list, { situation }, now).map(p => p.id);
    expect(ids('encerradas')).toEqual(['encerrada']);
    expect(ids('revogadas')).toEqual(['rev']);
    expect(ids('anuladas')).toEqual(['anu']);
    expect(ids('suspensas')).toEqual(['sus']);
    expect(ids('todas')).toHaveLength(5);
    expect(ids('abertas')).toEqual(['aberta', 'encerrada']); // /proposta já limita pelo prazo; tira revogadas etc.
  });
});

describe('validateFilters', () => {
  it('rejeita início posterior ao fim', () => {
    expect(validateFilters({ situation: 'todas', pubDateStart: '2026-10-01', pubDateEnd: '2026-09-01' }))
      .toBe('A data inicial de publicação é posterior à final.');
  });

  it('rejeita período de publicação acima de 365 dias (API oficial)', () => {
    expect(validateFilters({ situation: 'todas', pubDateStart: '2025-01-01', pubDateEnd: '2026-10-19' }))
      .toBe('O período de publicação não pode passar de 365 dias.');
  });

  it('ignora período de publicação para abertas', () => {
    expect(validateFilters({ situation: 'abertas', pubDateStart: '2020-01-01' })).toBeNull();
  });
});

describe('createSearch', () => {
  function stubPages(handler: (modality: number, page: number) => Response) {
    const f = vi.fn().mockImplementation(async (url: string) => {
      const p = new URL(url).searchParams;
      return handler(Number(p.get('codigoModalidadeContratacao')), Number(p.get('pagina')));
    });
    vi.stubGlobal('fetch', f);
    return f;
  }

  const record = (id: string) => ({ numeroControlePNCP: id, objetoCompra: `Objeto ${id}`, situacaoCompraId: 1 });

  it('lê até 5 páginas por lote e continua no próximo', async () => {
    const f = stubPages((_m, page) => jsonResponse(200, { data: [record(`p${page}`)], totalRegistros: 7, totalPaginas: 7 }));
    const search = createSearch({ modality: 6 }, today);
    const first = await search.next();
    expect(f).toHaveBeenCalledTimes(5);
    expect(first.hasMore).toBe(true);
    expect(first.scanned).toBe(5);
    expect(first.total).toBe(7);
    const second = await search.next();
    expect(f).toHaveBeenCalledTimes(7);
    expect(second.hasMore).toBe(false);
    expect(second.data).toHaveLength(2);
  });

  it('mostra resultados parciais quando uma modalidade falha', async () => {
    stubPages((m) => m === 8
      ? jsonResponse(500, { message: 'Erro interno' })
      : jsonResponse(200, { data: [record(`m${m}`)], totalRegistros: 1, totalPaginas: 1 }));
    const batch = await createSearch({}, today).next();
    expect(batch.data).toHaveLength(12);
    expect(batch.sources[0].status).toBe('error');
    expect(batch.sources[0].message).toMatch(/^Falha em 1 consulta\(s\): Erro interno/);
  });

  it('tenta de novo no próximo lote a modalidade que falhou', async () => {
    let failing = true;
    stubPages(() => failing
      ? jsonResponse(500, { message: 'Erro interno' })
      : jsonResponse(200, { data: [record('ok')], totalRegistros: 1, totalPaginas: 1 }));
    const search = createSearch({ modality: 6 }, today);
    const first = await search.next();
    expect(first.hasMore).toBe(true);
    failing = false;
    const second = await search.next();
    expect(second.data).toHaveLength(1);
    expect(second.hasMore).toBe(false);
  });

  it('avisa o progresso a cada página lida', async () => {
    stubPages((_m, page) => jsonResponse(200, { data: [record(`p${page}`)], totalRegistros: 3, totalPaginas: 3 }));
    const partials: number[] = [];
    const batch = await createSearch({ modality: 6 }, today).next(p => partials.push(p.data.length));
    expect(partials).toEqual([1, 2, 3]);
    expect(batch.data).toHaveLength(3);
  });

  it('next() chamado de novo durante um lote reaproveita o lote em andamento', async () => {
    const f = stubPages((_m, page) => jsonResponse(200, { data: [record(`p${page}`)], totalRegistros: 7, totalPaginas: 7 }));
    const search = createSearch({ modality: 6 }, today);
    const [a, b] = await Promise.all([search.next(), search.next()]);
    expect(f).toHaveBeenCalledTimes(5);
    expect(a).toEqual(b);
    expect(a.total).toBe(7);
  });

  it('cancel() interrompe a leitura de páginas', async () => {
    const f = stubPages((_m, page) => jsonResponse(200, { data: [record(`p${page}`)], totalRegistros: 7, totalPaginas: 7 }));
    const search = createSearch({ modality: 6 }, today);
    const batch = await search.next(() => search.cancel());
    expect(f).toHaveBeenCalledTimes(1);
    expect(batch.sources[0].status).toBe('ok');
  });

  it('não repete registro que aparece em duas páginas', async () => {
    stubPages(() => jsonResponse(200, { data: [record('mesmo')], totalRegistros: 2, totalPaginas: 2 }));
    const batch = await createSearch({ modality: 6 }, today).next();
    expect(batch.data).toHaveLength(1);
  });
});
