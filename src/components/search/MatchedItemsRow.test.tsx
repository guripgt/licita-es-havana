import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ProcessItem } from '@/lib/pncpItems';

const items = vi.hoisted(() => ({ fetchProcessItems: vi.fn() }));
vi.mock('@/lib/pncpItems', async (orig) => ({ ...(await orig<typeof import('@/lib/pncpItems')>()), ...items }));

import { MatchedItemsRow } from './MatchedItemsRow';

const item = (numero: number, descricao: string, over: Partial<ProcessItem> = {}): ProcessItem => ({
  numero, descricao, quantidade: 1600, unidade: 'UNIDADE', valorUnitario: 50.63, valorTotal: 81008, sigiloso: false, ...over,
});

function renderRow(searchText = 'panetone') {
  return render(<table><tbody><MatchedItemsRow externalId="01815216000178-1-000183/2026" searchText={searchText} colSpan={12} /></tbody></table>);
}

beforeEach(() => items.fetchProcessItems.mockReset());

describe('MatchedItemsRow', () => {
  it('mostra número, descrição, quantidade, valor unitário e total dos itens encontrados', async () => {
    items.fetchProcessItems.mockResolvedValue([
      item(1, 'ARROZ TIPO 1'),
      item(17, 'PANETONE COM GOTAS DE CHOCOLATE – NO MÍNIMO 450 G'),
      item(18, 'PANETONE DE FRUTAS – NO MÍNIMO 450 G', { valorUnitario: 44.46, valorTotal: 71136 }),
    ]);
    renderRow();
    expect(await screen.findByText('Item 17')).toBeInTheDocument();
    expect(screen.getByText('Item 18')).toBeInTheDocument();
    expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
    expect(screen.getByText('PANETONE COM GOTAS DE CHOCOLATE – NO MÍNIMO 450 G')).toBeInTheDocument();
    expect(screen.getAllByText('1.600 UNIDADE')).toHaveLength(2);
    expect(screen.getByText(/R\$\s50,63/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s81\.008,00/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s71\.136,00/)).toBeInTheDocument();
  });

  it('mostra até 5 itens e permite ver o restante', async () => {
    items.fetchProcessItems.mockResolvedValue(Array.from({ length: 8 }, (_, i) => item(i + 1, `Panetone tipo ${i + 1}`)));
    renderRow();
    expect(await screen.findByText('Item 5')).toBeInTheDocument();
    expect(screen.queryByText('Item 6')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ver mais 3 itens' }));
    expect(screen.getByText('Item 8')).toBeInTheDocument();
  });

  it('valor sigiloso aparece como "Sigiloso"', async () => {
    items.fetchProcessItems.mockResolvedValue([item(3, 'Panetone', { valorUnitario: null, valorTotal: null, sigiloso: true })]);
    renderRow();
    expect(await screen.findByText('Item 3')).toBeInTheDocument();
    expect(screen.getAllByText('Sigiloso')).toHaveLength(2);
  });

  it('avisa quando nenhum item tem a palavra na descrição', async () => {
    items.fetchProcessItems.mockResolvedValue([item(1, 'Cesta natalina')]);
    renderRow();
    expect(await screen.findByText(/Nenhum item com “panetone” na descrição/)).toBeInTheDocument();
  });

  it('em caso de erro, permite tentar de novo', async () => {
    items.fetchProcessItems.mockRejectedValueOnce(new Error('Não foi possível carregar os itens (HTTP 500)'));
    items.fetchProcessItems.mockResolvedValueOnce([item(17, 'Panetone')]);
    renderRow();
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Item 17')).toBeInTheDocument();
  });
});
