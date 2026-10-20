import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const store = vi.hoisted(() => ({
  exportBackup: vi.fn(),
  getSettings: vi.fn(),
  listDocuments: vi.fn(),
  getDocumentFileUrl: vi.fn(),
}));
vi.mock('@/lib/store', () => ({
  ...store,
  importBackup: vi.fn(),
  saveSettings: vi.fn(),
  addDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));

import SettingsPage from './Settings';
import Documents from './Documents';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Exportar backup', () => {
  it('não revoga o link antes do navegador começar o download (Safari)', async () => {
    store.getSettings.mockResolvedValue({ full_name: '', company_name: '', cnpj: '', email: '' });
    store.exportBackup.mockResolvedValue(new Blob(['{}']));
    URL.createObjectURL = vi.fn(() => 'blob:backup');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Exportar backup/ }));
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled());
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});

describe('Abrir documento', () => {
  it('abre a janela no próprio clique, antes de ler o arquivo (evita bloqueio de pop-up)', async () => {
    store.listDocuments.mockResolvedValue([{
      id: 'd1', name: 'CND Federal', category: 'Documento Fiscal', expiry_date: null, notes: null,
      created_at: '2026-10-19', file: { blob: new Blob(['x']), name: 'cnd.pdf', type: 'application/pdf' },
    }]);
    let resolveUrl: (u: string) => void = () => {};
    store.getDocumentFileUrl.mockReturnValue(new Promise<string>(r => { resolveUrl = r; }));
    const popup = { location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);

    render(<Documents />);
    fireEvent.click(await screen.findByRole('button', { name: 'CND Federal' }));
    expect(open).toHaveBeenCalledTimes(1);

    resolveUrl('blob:cnd');
    await waitFor(() => expect(popup.location.href).toBe('blob:cnd'));
  });
});
