/**
 * Armazenamento local (IndexedDB): processos salvos, documentos da empresa e configurações.
 * Os dados ficam só neste navegador; exportBackup/importBackup levam tudo para outro lugar.
 */

import type { NormalizedProcess } from '@/types/processes';

const DB_NAME = 'licitacoes-havana';
const DB_VERSION = 1;
const BACKUP_APP = 'licitacoes-havana';
const BACKUP_VERSION = 1;
const SETTINGS_KEY = 'profile';

type StoreName = 'processes' | 'documents' | 'settings';

export interface SavedProcess extends NormalizedProcess {
  key: string;
  funnel_stage: string;
  is_favorite: boolean;
  in_funnel: boolean;
  notes: string;
  linked_doc_ids: string[];
  created_at: string;
}

type ProcessPatch = Partial<Pick<SavedProcess, 'funnel_stage' | 'is_favorite' | 'in_funnel' | 'notes' | 'linked_doc_ids'>>;

export interface CompanyDocument {
  id: string;
  name: string;
  category: string;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
  file: { blob: Blob; name: string; type: string } | null;
}

export interface Settings {
  full_name: string;
  company_name: string;
  cnpj: string;
  email: string;
}

/** Documento como gravado: o arquivo vira ArrayBuffer (clonável em qualquer navegador). */
interface StoredDocument extends Omit<CompanyDocument, 'file'> {
  file: { data: ArrayBuffer; name: string; type: string } | null;
}

const EMPTY_SETTINGS: Settings = { full_name: '', company_name: '', cnpj: '', email: '' };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('processes', { keyPath: 'key' });
        db.createObjectStore('documents', { keyPath: 'id' });
        db.createObjectStore('settings');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/** Fecha a conexão em cache (usado pelos testes ao trocar de banco). */
export function _resetForTests(): void {
  dbPromise?.then(db => db.close());
  dbPromise = null;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Executa fn numa transação e resolve quando ela é concluída. fn não pode aguardar nada fora do IndexedDB. */
async function tx<T>(stores: StoreName[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
  const db = await openDb();
  const t = db.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  const result = await fn(t);
  await done;
  return result;
}

function byNewest<T extends { created_at: string }>(a: T, b: T): number {
  return b.created_at.localeCompare(a.created_at);
}

// ---------- Processos ----------

export function processKey(p: { source: string; external_id: string }): string {
  return `${p.source}_${p.external_id}`;
}

export function getProcess(key: string): Promise<SavedProcess | undefined> {
  return tx(['processes'], 'readonly', t => request(t.objectStore('processes').get(key)));
}

export async function listProcesses(): Promise<SavedProcess[]> {
  const all = await tx(['processes'], 'readonly', t => request(t.objectStore('processes').getAll()));
  return all.sort(byNewest);
}

/** Cria ou atualiza o processo salvo; remove-o quando não é favorito nem está no funil. */
export function saveProcess(p: NormalizedProcess, patch: ProcessPatch): Promise<SavedProcess> {
  const key = processKey(p);
  return tx(['processes'], 'readwrite', async t => {
    const store = t.objectStore('processes');
    const existing: SavedProcess | undefined = await request(store.get(key));
    const base: SavedProcess = existing ?? {
      ...p,
      key,
      funnel_stage: 'Encontrado',
      is_favorite: false,
      in_funnel: false,
      notes: '',
      linked_doc_ids: [],
      created_at: new Date().toISOString(),
    };
    const merged: SavedProcess = { ...base, ...patch };
    if (!merged.in_funnel && !merged.is_favorite) store.delete(key);
    else store.put(merged);
    return merged;
  });
}

export function deleteProcess(key: string): Promise<void> {
  return tx(['processes'], 'readwrite', t => { t.objectStore('processes').delete(key); });
}

// ---------- Documentos ----------

function fromStored(d: StoredDocument): CompanyDocument {
  return {
    ...d,
    file: d.file ? { blob: new Blob([d.file.data], { type: d.file.type }), name: d.file.name, type: d.file.type } : null,
  };
}

export async function listDocuments(): Promise<CompanyDocument[]> {
  const all: StoredDocument[] = await tx(['documents'], 'readonly', t => request(t.objectStore('documents').getAll()));
  return all.sort(byNewest).map(fromStored);
}

export async function addDocument(input: Omit<CompanyDocument, 'id' | 'created_at'>): Promise<CompanyDocument> {
  const stored: StoredDocument = {
    ...input,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    file: input.file ? { data: await input.file.blob.arrayBuffer(), name: input.file.name, type: input.file.type } : null,
  };
  await tx(['documents'], 'readwrite', t => { t.objectStore('documents').put(stored); });
  return fromStored(stored);
}

/** Exclui o documento e o desvincula de todos os processos. */
export function deleteDocument(id: string): Promise<void> {
  return tx(['documents', 'processes'], 'readwrite', async t => {
    t.objectStore('documents').delete(id);
    const processes = t.objectStore('processes');
    const all: SavedProcess[] = await request(processes.getAll());
    for (const p of all) {
      if (p.linked_doc_ids.includes(id)) processes.put({ ...p, linked_doc_ids: p.linked_doc_ids.filter(d => d !== id) });
    }
  });
}

export async function getDocumentFileUrl(id: string): Promise<string | null> {
  const doc: StoredDocument | undefined = await tx(['documents'], 'readonly', t => request(t.objectStore('documents').get(id)));
  if (!doc?.file) return null;
  return URL.createObjectURL(new Blob([doc.file.data], { type: doc.file.type }));
}

// ---------- Configurações ----------

export async function getSettings(): Promise<Settings> {
  const s: Settings | undefined = await tx(['settings'], 'readonly', t => request(t.objectStore('settings').get(SETTINGS_KEY)));
  return { ...EMPTY_SETTINGS, ...s };
}

export function saveSettings(s: Settings): Promise<void> {
  return tx(['settings'], 'readwrite', t => { t.objectStore('settings').put(s, SETTINGS_KEY); });
}

// ---------- Backup ----------

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function exportBackup(): Promise<Blob> {
  const [processes, documents, settings] = await tx(['processes', 'documents', 'settings'], 'readonly', t => Promise.all([
    request(t.objectStore('processes').getAll()) as Promise<SavedProcess[]>,
    request(t.objectStore('documents').getAll()) as Promise<StoredDocument[]>,
    request(t.objectStore('settings').get(SETTINGS_KEY)) as Promise<Settings | undefined>,
  ]));
  const backup = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    processes,
    documents: documents.map(d => ({ ...d, file: d.file ? { ...d.file, data: bufferToBase64(d.file.data) } : null })),
    settings: settings ?? EMPTY_SETTINGS,
  };
  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}

/** Substitui todos os dados pelos do backup. Arquivo inválido não altera nada. */
export async function importBackup(file: Blob): Promise<{ processes: number; documents: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let backup: any;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    throw new Error('Arquivo de backup inválido.');
  }
  if (backup?.app !== BACKUP_APP || backup?.version !== BACKUP_VERSION
    || !Array.isArray(backup.processes) || !Array.isArray(backup.documents)) {
    throw new Error('Arquivo de backup inválido.');
  }

  const processes: SavedProcess[] = backup.processes;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const documents: StoredDocument[] = backup.documents.map((d: any) => ({
    ...d,
    file: d.file ? { ...d.file, data: base64ToBuffer(d.file.data) } : null,
  }));

  await tx(['processes', 'documents', 'settings'], 'readwrite', t => {
    const ps = t.objectStore('processes');
    const ds = t.objectStore('documents');
    ps.clear();
    ds.clear();
    processes.forEach(p => ps.put(p));
    documents.forEach(d => ds.put(d));
    t.objectStore('settings').put({ ...EMPTY_SETTINGS, ...backup.settings }, SETTINGS_KEY);
  });
  return { processes: processes.length, documents: documents.length };
}
