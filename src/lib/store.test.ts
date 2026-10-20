// @vitest-environment node
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import type { NormalizedProcess } from '@/types/processes';
import {
  _resetForTests, processKey, getProcess, listProcesses, saveProcess,
  addDocument, listDocuments, deleteDocument, getSettings, saveSettings,
  exportBackup, importBackup,
} from './store';

function proc(id: string): NormalizedProcess {
  return {
    id: `pncp_${id}`, external_id: id, source: 'PNCP', title: `Objeto ${id}`, object_description: '', agency: 'Órgão',
    government_level: null, modality: null, estimated_value: 100, homologated_value: null, is_srp: false,
    state: 'SP', city: 'São Paulo', publication_date: null, opening_date: null, closing_date: null,
    status: null, status_id: 1, source_portal: 'PNCP', external_url: null,
  };
}

function freshDb() {
  _resetForTests();
  globalThis.indexedDB = new IDBFactory();
}

beforeEach(freshDb);

describe('processos', () => {
  it('cria com padrões e mescla alterações', async () => {
    const p = proc('a');
    await saveProcess(p, { in_funnel: true });
    expect((await getProcess(processKey(p)))?.funnel_stage).toBe('Encontrado');
    await saveProcess(p, { funnel_stage: 'Participando' });
    const saved = await getProcess(processKey(p));
    expect(saved?.in_funnel).toBe(true);
    expect(saved?.funnel_stage).toBe('Participando');
  });

  it('apaga quando deixa de ser favorito e não está no funil', async () => {
    const p = proc('a');
    await saveProcess(p, { is_favorite: true });
    await saveProcess(p, { is_favorite: false });
    expect(await getProcess(processKey(p))).toBeUndefined();
  });
});

describe('documentos', () => {
  it('guarda o arquivo e remove vínculos ao excluir', async () => {
    const doc = await addDocument({
      name: 'CND', category: 'Documento Fiscal', expiry_date: null, notes: null,
      file: { blob: new Blob(['abc'], { type: 'application/pdf' }), name: 'cnd.pdf', type: 'application/pdf' },
    });
    const [listed] = await listDocuments();
    expect(listed.file?.name).toBe('cnd.pdf');
    expect(await listed.file?.blob.text()).toBe('abc');

    const p = proc('a');
    await saveProcess(p, { in_funnel: true, linked_doc_ids: [doc.id] });
    await deleteDocument(doc.id);
    expect(await listDocuments()).toHaveLength(0);
    expect((await getProcess(processKey(p)))?.linked_doc_ids).toEqual([]);
  });
});

describe('configurações', () => {
  it('começa vazia', async () => {
    expect(await getSettings()).toEqual({ full_name: '', company_name: '', cnpj: '', email: '' });
  });
});

describe('backup', () => {
  it('exporta e importa tudo', async () => {
    await saveProcess(proc('a'), { in_funnel: true, notes: 'ver edital' });
    await addDocument({
      name: 'CND', category: 'Documento Fiscal', expiry_date: '2026-12-31', notes: null,
      file: { blob: new Blob(['abc']), name: 'cnd.pdf', type: 'application/pdf' },
    });
    await saveSettings({ full_name: 'Gui', company_name: 'Havana', cnpj: '1', email: 'a@b.c' });

    const backup = await exportBackup();
    freshDb();
    expect(await importBackup(backup)).toEqual({ processes: 1, documents: 1 });

    expect((await listProcesses())[0].notes).toBe('ver edital');
    const [doc] = await listDocuments();
    expect(await doc.file?.blob.text()).toBe('abc');
    expect((await getSettings()).company_name).toBe('Havana');
  });

  it('rejeita arquivo inválido sem apagar os dados', async () => {
    await saveProcess(proc('a'), { in_funnel: true });
    await expect(importBackup(new Blob(['{"foo":1}']))).rejects.toThrow('Arquivo de backup inválido.');
    await expect(importBackup(new Blob(['não é json']))).rejects.toThrow('Arquivo de backup inválido.');
    expect(await listProcesses()).toHaveLength(1);
  });
});
