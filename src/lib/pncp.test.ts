import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildPncpUrl, normalizePncpRecord, fetchPncpPage, PNCP_MODALITIES } from './pncp';

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

  it('tenta de novo após erro de rede', async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { data: [], totalRegistros: 3, totalPaginas: 1 }));
    vi.stubGlobal('fetch', f);
    await expect(fetchPncpPage('https://x')).resolves.toMatchObject({ totalRegistros: 3, totalPaginas: 1 });
  });
});

describe('PNCP_MODALITIES', () => {
  it('tem os 13 códigos oficiais', () => {
    expect(PNCP_MODALITIES.map(m => m.code)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
});
