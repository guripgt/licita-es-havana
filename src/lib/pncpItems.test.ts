import { describe, it, expect, vi, afterEach } from 'vitest';
import { compraPath, fetchProcessItems, matchItems, _clearItemsCache, type ProcessItem } from './pncpItems';

function jsonResponse(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

afterEach(() => { vi.unstubAllGlobals(); _clearItemsCache(); });

const apiItem = (n: number, descricao: string, over: Record<string, unknown> = {}) => ({
  numeroItem: n, descricao, quantidade: 1600, unidadeMedida: 'UNIDADE',
  valorUnitarioEstimado: 50.63, valorTotal: 81008, orcamentoSigiloso: false, ...over,
});

describe('compraPath', () => {
  it('extrai CNPJ, ano e sequencial do número de controle do PNCP', () => {
    expect(compraPath('01815216000178-1-000183/2026')).toBe('01815216000178/compras/2026/183');
  });

  it('devolve null para id fora do padrão', () => {
    expect(compraPath('abc')).toBeNull();
  });
});

describe('fetchProcessItems', () => {
  it('busca os itens da compra e converte os campos', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(200, [apiItem(17, 'PANETONE COM GOTAS DE CHOCOLATE')]));
    vi.stubGlobal('fetch', f);
    const items = await fetchProcessItems('01815216000178-1-000183/2026');
    expect(new URL(f.mock.calls[0][0]).pathname).toBe('/api/pncp/v1/orgaos/01815216000178/compras/2026/183/itens');
    expect(items).toEqual([{
      numero: 17, descricao: 'PANETONE COM GOTAS DE CHOCOLATE', quantidade: 1600, unidade: 'UNIDADE',
      valorUnitario: 50.63, valorTotal: 81008, sigiloso: false,
    }]);
  });

  it('pagina quando a compra tem mais itens que uma página', async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => apiItem(i + 1, `Item ${i + 1}`));
    const f = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, page1))
      .mockResolvedValueOnce(jsonResponse(200, [apiItem(501, 'Panetone')]));
    vi.stubGlobal('fetch', f);
    const items = await fetchProcessItems('01815216000178-1-000183/2026');
    expect(items).toHaveLength(501);
    expect(new URL(f.mock.calls[1][0]).searchParams.get('pagina')).toBe('2');
  });

  it('guarda em cache: a mesma compra não é buscada duas vezes', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(200, [apiItem(1, 'Panetone')]));
    vi.stubGlobal('fetch', f);
    await fetchProcessItems('01815216000178-1-000183/2026');
    await fetchProcessItems('01815216000178-1-000183/2026');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('falha com mensagem clara e não guarda o erro no cache', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(jsonResponse(500))
      .mockResolvedValueOnce(jsonResponse(200, []));
    vi.stubGlobal('fetch', f);
    await expect(fetchProcessItems('01815216000178-1-000183/2026')).rejects.toThrow('Não foi possível carregar os itens');
    await expect(fetchProcessItems('01815216000178-1-000183/2026')).resolves.toEqual([]);
  });
});

describe('limite de consultas simultâneas', () => {
  it('consulta no máximo 6 compras ao mesmo tempo', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
      return jsonResponse(200, []);
    }));
    await Promise.all(Array.from({ length: 20 }, (_, i) =>
      fetchProcessItems(`01815216000178-1-${String(i + 1).padStart(6, '0')}/2026`)));
    expect(maxInFlight).toBe(6);
  });
});

describe('matchItems', () => {
  const items: ProcessItem[] = [
    { numero: 1, descricao: 'ARROZ TIPO 1', quantidade: 10, unidade: 'KG', valorUnitario: 5, valorTotal: 50, sigiloso: false },
    { numero: 17, descricao: 'PANETONE COM GOTAS DE CHOCOLATE – 450 G', quantidade: 1600, unidade: 'UNIDADE', valorUnitario: 50.63, valorTotal: 81008, sigiloso: false },
    { numero: 18, descricao: 'Panetones de frutas', quantidade: 1600, unidade: 'UNIDADE', valorUnitario: 44.46, valorTotal: 71136, sigiloso: false },
    { numero: 20, descricao: 'Material de limpeza geral', quantidade: 1, unidade: 'UN', valorUnitario: null, valorTotal: null, sigiloso: true },
  ];

  it('encontra itens com a palavra, sem diferenciar acento, caixa ou plural', () => {
    expect(matchItems(items, 'panetone').map(i => i.numero)).toEqual([17, 18]);
    expect(matchItems(items, 'PANETONÉ').map(i => i.numero)).toEqual([17, 18]);
  });

  it('exige todas as palavras e respeita frase entre aspas', () => {
    expect(matchItems(items, 'panetone chocolate').map(i => i.numero)).toEqual([17]);
    expect(matchItems(items, '"material de limpeza"').map(i => i.numero)).toEqual([20]);
    expect(matchItems(items, '"limpeza de material"')).toEqual([]);
  });

  it('sem palavra-chave não destaca nada', () => {
    expect(matchItems(items, '  ')).toEqual([]);
  });
});
