import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HashRouter, MemoryRouter, Route, Routes } from 'react-router-dom';

const store = vi.hoisted(() => ({ getProcess: vi.fn(), listDocuments: vi.fn() }));
vi.mock('@/lib/store', async (orig) => ({ ...(await orig<typeof import('@/lib/store')>()), ...store }));

import NotFound from './NotFound';
import ProcessDetail from './ProcessDetail';

describe('NotFound', () => {
  it('o link de volta fica dentro do app (funciona no GitHub Pages)', () => {
    render(<HashRouter><NotFound /></HashRouter>);
    expect(screen.getByRole('link', { name: 'Voltar ao início' }).getAttribute('href')).toBe('#/');
  });
});

describe('ProcessDetail', () => {
  it('mostra "não encontrado" em vez de carregar para sempre se o armazenamento falhar', async () => {
    store.getProcess.mockRejectedValue(new Error('IndexedDB indisponível'));
    store.listDocuments.mockRejectedValue(new Error('IndexedDB indisponível'));
    render(
      <MemoryRouter initialEntries={['/licitacao/PNCP/abc']}>
        <Routes><Route path="/licitacao/:source/:externalId" element={<ProcessDetail />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Processo não encontrado.')).toBeInTheDocument();
  });

  it('aceita id com % sem quebrar', async () => {
    store.getProcess.mockResolvedValue(undefined);
    store.listDocuments.mockResolvedValue([]);
    render(
      <MemoryRouter initialEntries={['/licitacao/PNCP/100%25']}>
        <Routes><Route path="/licitacao/:source/:externalId" element={<ProcessDetail />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Processo não encontrado.')).toBeInTheDocument();
    expect(store.getProcess).toHaveBeenCalledWith('PNCP_100%');
  });
});
