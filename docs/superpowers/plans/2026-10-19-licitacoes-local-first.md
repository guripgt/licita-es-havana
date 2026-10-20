# Licitações Havana — Local-first Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o app Lovable funcionar de ponta a ponta sem backend: busca real no PNCP pelo navegador, dados em IndexedDB, publicado no GitHub Pages.

**Architecture:** As telas React existentes passam a depender de dois módulos novos: `src/lib/pncp.ts` (API pública PNCP via `fetch`) e `src/lib/store.ts` (IndexedDB). Supabase, login e Lovable tagger são removidos; roteamento vira `HashRouter`.

**Tech Stack:** React 18, Vite 5, TypeScript, shadcn/Tailwind, Vitest + jsdom, `fake-indexeddb` (dev), Playwright (smoke e2e), GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-10-19-licitacoes-local-first-design.md`

## Global Constraints

- Interface preservada: mesmos componentes, classes, textos e rotas (`/`, `/buscar`, `/licitacao/:source/:externalId`, `/funil`, `/documentos`, `/configuracoes`), agora sob `#`.
- PNCP: `https://pncp.gov.br/api/consulta`; `tamanhoPagina=50` sempre; datas `AAAAMMDD`; período `/publicacao` ≤ 365 dias.
- Até 5 páginas por modalidade por lote; modalidades em lotes paralelos de 4; timeout 30s, 1 nova tentativa.
- Sem dependências novas de runtime. Dev: `fake-indexeddb` apenas.
- Textos da UI em português.
- Node via nvm (`source ~/.nvm/nvm.sh`, v22.18.0). Sem `bun`; usar `npm`.
- Commits com `git -c user.name=guripgt -c user.email=contato.guirabelo@gmail.com` e trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. "Todas modalidades" sem UF, com algumas modalidades dando timeout/500 → resultados das que responderam aparecem; as falhas aparecem no aviso de fontes. (teste em Task 2)
2. Data só-dia (`"2026-10-19"`) exibida no fuso de Brasília → mostra `19/10/2026`, não `18/10/2026` (`new Date('YYYY-MM-DD')` é UTC). (teste em Task 1)
3. Abrir `#/licitacao/PNCP/<id>` numa aba nova, processo não salvo e sem `sessionStorage` → tela "Processo não encontrado", sem quebrar. (verificação em Task 4)
4. Importar backup de arquivo inválido → mensagem de erro, dados existentes intactos. (teste em Task 3)
5. Excluir documento vinculado a processos → some de `linked_doc_ids`; detalhe não quebra. (teste em Task 3)

---

### Task 0: Ambiente

**Files:**
- Modify: `package.json`, `package-lock.json`
- Delete: `bun.lock`, `bun.lockb`

- [ ] **Step 1:** `source ~/.nvm/nvm.sh && nvm use 22 && npm ci` — expected: instala sem erro.
- [ ] **Step 2:** `npm i -D fake-indexeddb` e remover `bun.lock`, `bun.lockb`.
- [ ] **Step 3:** `npm test` — expected: `example.test.ts` PASS.
- [ ] **Step 4:** Commit `chore: ambiente npm e fake-indexeddb`.

---

### Task 1: Cliente PNCP — URLs, normalização, requisição

**Files:**
- Create: `src/lib/pncp.ts`, `src/lib/pncp.test.ts`, `src/lib/constants.test.ts`
- Modify: `src/types/processes.ts`, `src/lib/constants.ts`

**Interfaces:**
- Produces (em `src/types/processes.ts`):
  - `type Situation = 'abertas' | 'encerradas' | 'revogadas' | 'anuladas' | 'suspensas' | 'todas'`
  - `SearchFilters`: remove `status`, `page`, `pageSize`, `openDateStart/End` permanecem; adiciona `modality?: number` (código PNCP; antes string), `situation?: Situation`, `pubDateStart?: string`, `pubDateEnd?: string` (`YYYY-MM-DD`).
  - `NormalizedProcess`: adiciona `homologated_value: number | null`, `status_id: number | null`. `estimated_value` = só `valorTotalEstimado`.
  - `SourceStatus` e `SearchResult`: mantidos; `SearchResult` deixa de ser usado pela tela (pode ser removido).
- Produces (em `src/lib/pncp.ts`):
  - `PNCP_MODALITIES: { code: number; label: string }[]` — os 13 códigos do spec, rótulos: `Leilão - Eletrônico`, `Diálogo Competitivo`, `Concurso`, `Concorrência - Eletrônica`, `Concorrência - Presencial`, `Pregão - Eletrônico`, `Pregão - Presencial`, `Dispensa de Licitação`, `Inexigibilidade`, `Manifestação de Interesse`, `Pré-qualificação`, `Credenciamento`, `Leilão - Presencial`.
  - `buildPncpUrl(filters: SearchFilters, modalityCode: number, page: number, today: Date): string`
  - `normalizePncpRecord(record: any): NormalizedProcess`
  - `fetchPncpPage(url: string): Promise<{ data: NormalizedProcess[]; totalRegistros: number; totalPaginas: number }>`
- Produces (em `src/lib/constants.ts`): `formatDate` corrigido; `MODALITIES` e `STATUS_OPTIONS` removidos; `SITUATION_OPTIONS: { value: Situation; label: string }[]` = `abertas`→`Abertas (recebendo propostas)`, `encerradas`→`Encerradas`, `revogadas`→`Revogadas`, `anuladas`→`Anuladas`, `suspensas`→`Suspensas`, `todas`→`Todas`.

- [ ] **Step 1: Testes que falham** (`src/lib/pncp.test.ts`, `src/lib/constants.test.ts`):
  - `buildPncpUrl({}, 6, 1, new Date('2026-10-19T12:00:00'))` → path `/v1/contratacoes/proposta`, params `dataFinal=20271019`, `codigoModalidadeContratacao=6`, `pagina=1`, `tamanhoPagina=50`, sem `uf`.
  - `buildPncpUrl({ uf: 'SP', closeDateEnd: '2026-12-31' }, 6, 2, today)` → `uf=SP`, `dataFinal=20261231`, `pagina=2`.
  - `buildPncpUrl({ situation: 'todas', pubDateStart: '2026-07-01', pubDateEnd: '2026-09-30' }, 8, 1, today)` → path `/v1/contratacoes/publicacao`, `dataInicial=20260701`, `dataFinal=20260930`.
  - `buildPncpUrl({ situation: 'encerradas' }, 8, 1, today)` sem datas → `dataInicial=20260721`, `dataFinal=20261019` (90 dias).
  - `normalizePncpRecord(fixture)` com fixture mínima (orgaoEntidade cnpj `08778268000160`, anoCompra 2026, sequencialCompra 627, numeroControlePNCP `08778268000160-1-000627/2026`, situacaoCompraId 1, valorTotalEstimado 1000, valorTotalHomologado 900, linkSistemaOrigem null, unidadeOrgao `{ufSigla:'SP', municipioNome:'São Paulo'}`, dataEncerramentoProposta `2026-11-01T09:00:00`) → `id 'pncp_08778268000160-1-000627/2026'`, `external_url 'https://pncp.gov.br/app/editais/08778268000160/2026/627'`, `estimated_value 1000`, `homologated_value 900`, `status_id 1`, `state 'SP'`, `closing_date '2026-11-01T09:00:00'`.
  - `fetchPncpPage`: `fetch` mockado com 204 → `{data:[], totalRegistros:0, totalPaginas:0}`; 400 com `{"message":"Tamanho de página inválido"}` duas vezes → rejeita com Error cuja mensagem contém `Tamanho de página inválido`; primeira chamada rejeitando com TypeError e segunda 200 → resolve (retry).
  - `PNCP_MODALITIES` tem 13 itens, códigos 1..13.
  - `formatDate('2026-10-19')` → `'19/10/2026'`; `formatDate('2026-11-01T09:00:00')` → `'01/11/2026'`; `formatDate(null)` → `'—'`.
- [ ] **Step 2:** `npx vitest run src/lib` — expected: FAIL (módulo não existe).
- [ ] **Step 3: Implementar.** `fetchPncpPage` usa `AbortController` (30000 ms) e uma nova tentativa em erro de rede/timeout/status ≥ 500 ou 400; mensagem de erro = `json.message` quando houver, senão `HTTP <status>`. `formatDate`: string `YYYY-MM-DD` pura → montar `new Date(y, m-1, d)`; demais → `new Date(str)`.
- [ ] **Step 4:** `npx vitest run src/lib` — expected: PASS.
- [ ] **Step 5:** Commit `feat: cliente PNCP no navegador`.

---

### Task 2: Busca incremental e filtros locais

**Files:**
- Modify: `src/lib/pncp.ts`, `src/lib/pncp.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `validateFilters(filters: SearchFilters): string | null` — `null` se ok; mensagens exatas: `'O período de publicação não pode passar de 365 dias.'`, `'A data inicial de publicação é posterior à final.'`. Só valida quando `situation` ≠ `abertas`/indefinida.
  - `applyLocalFilters(list: NormalizedProcess[], filters: SearchFilters, now: Date): NormalizedProcess[]`
  - `interface SearchBatch { data: NormalizedProcess[]; scanned: number; total: number; sources: SourceStatus[]; hasMore: boolean }`
  - `createSearch(filters: SearchFilters, today?: Date): { next(): Promise<SearchBatch> }` — cada `next()` lê as próximas até 5 páginas de cada modalidade ainda com páginas (todas as 13 se `filters.modality` indefinido), em lotes de 4 modalidades; `data` = só os novos registros do lote, já filtrados e deduplicados (por `id`) contra os lotes anteriores; `scanned` e `total` acumulados (total = soma de `totalRegistros`); `sources` = um item `{name:'PNCP', status}`: `ok` se alguma página respondeu, `error` com `message` `'Falha em N consulta(s): <primeira mensagem>'` se alguma falhou, `empty` se nada voltou.

- [ ] **Step 1: Testes que falham:**
  - `applyLocalFilters`: texto `'pregao eletronico'` casa título `'PREGÃO ELETRÔNICO para...'`; `excludeText 'obra'` remove item com `'Obra de reforma'`; `minValue 500` remove `estimated_value null`; `srp 'sim'` mantém só `is_srp true`; `city 'sao paulo'` casa `'São Paulo'`; `situation 'encerradas'` mantém só `status_id 1` com `closing_date` < `now`; `revogadas` → `status_id 2`; `anuladas` → 3; `suspensas` → 4; `todas` mantém tudo.
  - `validateFilters({situation:'todas', pubDateStart:'2025-01-01', pubDateEnd:'2026-10-19'})` → mensagem de 365 dias; `{situation:'abertas', pubDateStart:'2020-01-01'}` → `null`.
  - `createSearch({ modality: 6 })` com fetch mockado: totalPaginas 7 → primeiro `next()` faz 5 requisições, `hasMore true`; segundo faz 2, `hasMore false`.
  - `createSearch({})` com mock em que a modalidade 8 sempre responde 500 e as outras retornam 1 registro cada → `data.length === 12`, `sources[0].status === 'error'`, `message` começa com `'Falha em'`. (Review Focus 1)
  - Registro repetido entre páginas aparece uma vez só.
- [ ] **Step 2:** `npx vitest run src/lib/pncp.test.ts` — expected: FAIL.
- [ ] **Step 3: Implementar** reaproveitando `normalizeText` (sem acento, minúsculas) da função antiga.
- [ ] **Step 4:** `npx vitest run src/lib/pncp.test.ts` — expected: PASS.
- [ ] **Step 5:** Commit `feat: busca PNCP incremental com filtros locais`.

---

### Task 3: Armazenamento local (IndexedDB)

**Files:**
- Create: `src/lib/store.ts`, `src/lib/store.test.ts`

**Interfaces:**
- Consumes: `NormalizedProcess`.
- Produces:
  - `interface SavedProcess extends NormalizedProcess { key: string; funnel_stage: string; is_favorite: boolean; in_funnel: boolean; notes: string; linked_doc_ids: string[]; created_at: string }`
  - `processKey(p: { source: string; external_id: string }): string` → `` `${source}_${external_id}` ``
  - `getProcess(key: string): Promise<SavedProcess | undefined>`
  - `listProcesses(): Promise<SavedProcess[]>` (ordem `created_at` desc)
  - `saveProcess(p: NormalizedProcess, patch: Partial<Pick<SavedProcess,'funnel_stage'|'is_favorite'|'in_funnel'|'notes'|'linked_doc_ids'>>): Promise<SavedProcess>` — cria com padrões (`funnel_stage 'Encontrado'`, `is_favorite false`, `in_funnel false`, `notes ''`, `linked_doc_ids []`) ou mescla; se resultado tiver `in_funnel false` e `is_favorite false`, apaga e retorna o objeto.
  - `interface CompanyDocument { id: string; name: string; category: string; expiry_date: string | null; notes: string | null; created_at: string; file: { blob: Blob; name: string; type: string } | null }`
  - `listDocuments(): Promise<CompanyDocument[]>` (desc), `addDocument(input: Omit<CompanyDocument,'id'|'created_at'>): Promise<CompanyDocument>`, `deleteDocument(id: string): Promise<void>` (remove o id de `linked_doc_ids` de todos os processos), `getDocumentFileUrl(id: string): Promise<string | null>` (`URL.createObjectURL`)
  - `interface Settings { full_name: string; company_name: string; cnpj: string; email: string }`; `getSettings(): Promise<Settings>` (vazio por padrão), `saveSettings(s: Settings): Promise<void>`
  - `exportBackup(): Promise<Blob>` — JSON `{ app: 'licitacoes-havana', version: 1, exported_at, processes, documents (file.blob → base64 dataUrl), settings }`
  - `importBackup(file: Blob): Promise<{ processes: number; documents: number }>` — valida `app`/`version` antes de tocar no banco; inválido → `throw new Error('Arquivo de backup inválido.')`; válido → substitui tudo numa transação.
  - Banco `licitacoes-havana`, versão 1, stores `processes` (keyPath `key`), `documents` (keyPath `id`), `settings`.

- [ ] **Step 1: Testes que falham** (`import 'fake-indexeddb/auto'`; zerar com `indexedDB = new IDBFactory()` + reabrir em `beforeEach` — exportar `_resetForTests()` que fecha a conexão em cache):
  - `saveProcess(p, {in_funnel:true})` depois `getProcess(processKey(p))` → `funnel_stage 'Encontrado'`; `saveProcess(p, {funnel_stage:'Participando'})` mantém `in_funnel true`.
  - `saveProcess(p, {is_favorite:true})` e depois `{is_favorite:false}` → `getProcess` retorna `undefined`.
  - `addDocument` com `file` Blob `'abc'` → `listDocuments()[0].file.name` correto; `deleteDocument` remove o id de `linked_doc_ids` de um processo vinculado. (Review Focus 5)
  - `getSettings()` vazio → `{full_name:'', company_name:'', cnpj:'', email:''}`.
  - Backup ida e volta: exporta, `_resetForTests()`, importa → mesmos processos, documentos (conteúdo do blob `'abc'`) e settings.
  - `importBackup(new Blob(['{"foo":1}']))` rejeita `'Arquivo de backup inválido.'` e `listProcesses()` continua com os dados anteriores. (Review Focus 4)
- [ ] **Step 2:** `npx vitest run src/lib/store.test.ts` — expected: FAIL.
- [ ] **Step 3: Implementar** com IndexedDB nativo (wrapper `openDb()` com conexão em cache e helpers `tx(store, mode, fn)`). `crypto.randomUUID()` para ids.
- [ ] **Step 4:** `npx vitest run src/lib/store.test.ts` — expected: PASS.
- [ ] **Step 5:** Commit `feat: armazenamento local em IndexedDB`.

---

### Task 4: Telas Buscar e Detalhe

**Files:**
- Modify: `src/pages/SearchProcesses.tsx`, `src/pages/ProcessDetail.tsx`

**Interfaces:**
- Consumes: Tasks 1–3 (`createSearch`, `validateFilters`, `PNCP_MODALITIES`, `SITUATION_OPTIONS`, `saveProcess`, `getProcess`, `listProcesses`, `listDocuments`, `processKey`).

- [ ] **Step 1: Buscar.** Substituir `searchProcesses`/Supabase por `createSearch`: "Buscar" cria a sessão e chama `next()`; o botão existente de carregar mais chama `next()` e acrescenta `data`; texto do contador: `` `${processes.length} resultado(s) em ${scanned} de ${total} editais analisados` ``; botão some quando `hasMore` false. Antes de buscar, `validateFilters` → `toast.error(msg)`. Select Modalidade usa `PNCP_MODALITIES` (valor = código como string). Select "Situação" usa `SITUATION_OPTIONS`, padrão `abertas`. Quando situação ≠ `abertas`, mostrar dois inputs date `Publicação (início)` / `Publicação (fim)` no mesmo grid dos demais. Remover seletor "Resultados por página" e o aviso `demoMode`. Favoritos = `Set` de `key` de `listProcesses()` com `is_favorite`. Favoritar/Salvar no funil → `saveProcess`. Remover "Configure sua empresa primeiro". Filtros salvos em `localStorage` continuam (adicionar os novos campos).
- [ ] **Step 2: Detalhe.** Rota `/licitacao/:id` legada removida. Carrega `getProcess(processKey({source, external_id}))` → senão `sessionStorage` → senão tela vazia já existente "não encontrado". Notas/etapa/favorito → `saveProcess` (salvar etapa ou notas implica `in_funnel: true`). Documentos vinculados = `listDocuments()` filtrado por `linked_doc_ids`; vincular → `saveProcess(p, {in_funnel:true, linked_doc_ids:[...]})`. Adicionar linha `{ label: 'Valor Homologado', value: formatCurrency(process.homologated_value) }` só quando não nulo.
- [ ] **Step 3:** `npx tsc -p tsconfig.app.json --noEmit && npm test` — expected: sem erros, testes PASS.
- [ ] **Step 4:** `npm run dev` e no navegador: buscar com UF SP e Pregão - Eletrônico → resultados reais; favoritar; abrir detalhe; abrir `#/licitacao/PNCP/xyz` em aba nova → "não encontrado". (Review Focus 3)
- [ ] **Step 5:** Commit `feat: telas de busca e detalhe usam PNCP e armazenamento local`.

---

### Task 5: Dashboard, Funil, Documentos

**Files:**
- Modify: `src/pages/Dashboard.tsx`, `src/pages/Funnel.tsx`, `src/pages/Documents.tsx`

- [ ] **Step 1:** Dashboard e Funil: `listProcesses()` filtrado por `in_funnel`; campos que vinham de `public_processes(...)` passam a ser lidos direto do `SavedProcess` (ajustar `item.public_processes.title` → `item.title` etc.); mover etapa → `saveProcess(item, {funnel_stage})`; identificador de item = `key`; navegação para detalhe = `/licitacao/${source}/${encodeURIComponent(external_id)}`.
- [ ] **Step 2:** Documentos: `listDocuments`/`addDocument` (arquivo do input vira `{blob: file, name: file.name, type: file.type}`)/`deleteDocument`; abrir arquivo → `getDocumentFileUrl` + `window.open`.
- [ ] **Step 3:** `npx tsc -p tsconfig.app.json --noEmit && npm test` — expected: OK.
- [ ] **Step 4:** Navegador: salvar 2 processos no funil, arrastar entre etapas, recarregar (persistiu); cadastrar documento com PDF, abrir, excluir.
- [ ] **Step 5:** Commit `feat: dashboard, funil e documentos locais`.

---

### Task 6: Configurações, layout e remoção do Supabase/login

**Files:**
- Modify: `src/pages/Settings.tsx`, `src/components/layout/AppLayout.tsx`, `src/components/layout/AppSidebar.tsx`, `src/App.tsx`, `vite.config.ts`, `package.json`, `playwright.config.ts`, `playwright-fixture.ts`, `index.html` (título se for "Lovable"), `README.md`
- Delete: `src/integrations/`, `supabase/`, `src/contexts/AuthContext.tsx`, `src/components/ProtectedRoute.tsx`, `src/pages/Login.tsx`, `src/lib/searchApi.ts`, `.env`
- Create: `e2e/smoke.spec.ts`

- [ ] **Step 1:** Settings: um formulário (perfil + empresa) com `getSettings`/`saveSettings`; seção "Backup" com "Exportar backup" (download `licitacoes-backup-YYYY-MM-DD.json`) e "Importar backup" (input file `.json`, confirmação, `toast` com contagens ou erro) e o texto: `Seus dados ficam salvos apenas neste navegador. Exporte um backup regularmente.`
- [ ] **Step 2:** AppLayout mostra `settings.full_name || 'Usuário'`; Sidebar sem "Sair". App.tsx: `HashRouter`, sem `AuthProvider`/`ProtectedRoute`/`/login`. `vite.config.ts`: `base: './'`, sem `lovable-tagger`. Remover deps `@supabase/supabase-js`, `lovable-tagger`; `.env` adicionado ao `.gitignore`. README em português: o que é, como rodar (`npm i`, `npm run dev`), link do app.
- [ ] **Step 3:** Playwright: `playwright.config.ts` próprio (`webServer: npm run build && npm run preview -- --port 4173`, `baseURL http://localhost:4173`, `testDir e2e`), apagar `playwright-fixture.ts`. `e2e/smoke.spec.ts`: abre `/#/buscar`, escolhe UF `SP` e modalidade `Pregão - Eletrônico`, clica Buscar, espera (timeout 90s) ≥ 1 linha de resultado; clica "Salvar no funil" na primeira; vai a `/#/funil` e vê o título; recarrega e continua vendo.
- [ ] **Step 4:** `grep -rn supabase src` → vazio; `npx tsc -p tsconfig.app.json --noEmit && npm test && npm run build && npx playwright install chromium && npx playwright test` — expected: tudo PASS.
- [ ] **Step 5:** Commit `refactor: remove Supabase e login; configurações com backup`.

---

### Task 7: Publicação no GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1:** Workflow em push para `main`: `actions/checkout@v4`, `actions/setup-node@v4` (node 22, cache npm), `npm ci`, `npm test`, `npm run build`, `actions/upload-pages-artifact@v3` (`dist`), job `deploy` com `actions/deploy-pages@v4`, permissões `pages: write`, `id-token: write`.
- [ ] **Step 2:** Push para `main` (token via `http.extraHeader`, nunca gravado em arquivo); tornar repo público e ativar Pages com `build_type: workflow` via API (`PATCH /repos/guripgt/licita-es-havana` `{"private":false}`; `POST /repos/.../pages` `{"build_type":"workflow"}`).
- [ ] **Step 3:** Acompanhar o run até `success`; abrir `https://guripgt.github.io/licita-es-havana/` e repetir a busca real com UF SP — expected: resultados.
- [ ] **Step 4:** Commit final se houver ajustes.
