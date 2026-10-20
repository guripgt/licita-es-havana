// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NormalizedProcess } from '@/types/processes';
import { _resetForTests, getProcess, processKey, saveProcess } from '@/lib/store';
import Favorites from './Favorites';
import Funnel from './Funnel';
import Dashboard from './Dashboard';

function proc(id: string, title: string): NormalizedProcess {
  return {
    id: `pncp_${id}`, external_id: id, source: 'PNCP', title, object_description: '', agency: 'Órgão',
    government_level: null, modality: 'Pregão - Eletrônico', estimated_value: 100, homologated_value: null, is_srp: false,
    state: 'GO', city: 'Rio Verde', publication_date: null, opening_date: null, closing_date: '2099-01-01T08:00',
    status: 'Divulgada no PNCP', status_id: 1, source_portal: 'PNCP', external_url: null,
  };
}

const renderIn = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  _resetForTests();
  globalThis.indexedDB = new IDBFactory();
});

describe('Favoritos', () => {
  it('lista só os processos marcados com estrela', async () => {
    await saveProcess(proc('a', 'Panetone natalino'), { is_favorite: true });
    await saveProcess(proc('b', 'Cadeiras escolares'), { in_funnel: true });
    renderIn(<Favorites />);
    expect(await screen.findByText('Panetone natalino')).toBeInTheDocument();
    expect(screen.queryByText('Cadeiras escolares')).not.toBeInTheDocument();
  });

  it('desfavoritar tira o processo da lista', async () => {
    await saveProcess(proc('a', 'Panetone natalino'), { is_favorite: true });
    renderIn(<Favorites />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remover dos favoritos' }));
    await waitFor(() => expect(screen.queryByText('Panetone natalino')).not.toBeInTheDocument());
    expect(await getProcess(processKey(proc('a', '')))).toBeUndefined();
  });

  it('envia um favorito para o funil', async () => {
    await saveProcess(proc('a', 'Panetone natalino'), { is_favorite: true });
    renderIn(<Favorites />);
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar no funil' }));
    await waitFor(async () => expect((await getProcess(processKey(proc('a', ''))))?.in_funnel).toBe(true));
  });

  it('mostra orientação quando ainda não há favoritos', async () => {
    renderIn(<Favorites />);
    expect(await screen.findByText(/Nenhum favorito ainda/)).toBeInTheDocument();
  });
});

describe('Remover do funil', () => {
  it('no Funil: pede confirmação e remove o cartão', async () => {
    await saveProcess(proc('a', 'Panetone natalino'), { in_funnel: true, notes: 'ver edital' });
    renderIn(<Funnel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remover do funil' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/observações e os documentos vinculados/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(screen.queryByText('Panetone natalino')).not.toBeInTheDocument());
    expect(await getProcess(processKey(proc('a', '')))).toBeUndefined();
  });

  it('cancelar mantém o processo', async () => {
    await saveProcess(proc('a', 'Panetone natalino'), { in_funnel: true });
    renderIn(<Funnel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remover do funil' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('Panetone natalino')).toBeInTheDocument();
    expect((await getProcess(processKey(proc('a', '')))))?.toMatchObject({ in_funnel: true });
  });

  it('processo favorito sai do funil mas continua nos favoritos', async () => {
    await saveProcess(proc('a', 'Panetone natalino'), { in_funnel: true, is_favorite: true });
    renderIn(<Dashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remover do funil' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/continua nos Favoritos/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(screen.queryByText('Panetone natalino')).not.toBeInTheDocument());
    expect(await getProcess(processKey(proc('a', '')))).toMatchObject({ in_funnel: false, is_favorite: true });
  });
});
