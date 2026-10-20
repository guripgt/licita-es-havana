# Licitações Havana — tornar o app funcional (local-first)

Data: 2026-10-19

## Objetivo

Fazer o app criado no Lovable funcionar de ponta a ponta, mantendo interface e funções
(Dashboard, Buscar, Detalhe, Funil, Documentos, Configurações). Uso individual.
Sucesso = buscar licitações abertas reais do PNCP, salvar no funil/favoritos, anotar,
anexar documentos, e abrir o app por um link na internet.

## Diagnóstico (por que nunca funcionou)

1. A edge function pedia `tamanhoPagina=500` ao PNCP; o máximo é 50 → toda chamada
   retornava `400 "Tamanho de página inválido"`, e o erro era engolido como "Nenhum resultado".
2. Usava `/v1/contratacoes/publicacao` (publicadas no período) em vez de
   `/v1/contratacoes/proposta` (recebendo propostas), lia só a página 1 e filtrava texto
   depois, sobre poucos registros.
3. O projeto Supabase (`ccgcmpvtuxwrxirohicx`) não existe mais (DNS não resolve):
   login, banco e função estão fora do ar.
4. Bugs no esquema: sem políticas de INSERT para `companies`/`public_processes`;
   `getPublicUrl` em bucket privado.

## Decisões

- **Sem backend e sem login.** Dados no navegador (IndexedDB). PNCP é chamado direto
  do navegador (verificado: `access-control-allow-origin: *`).
- **Hospedagem:** GitHub Pages, repositório `guripgt/licita-es-havana` tornado público.
- **Interface preservada:** mesmos componentes, layout, textos e rotas.

## Arquitetura

```
React (telas existentes)
 ├─ src/lib/pncp.ts   → API pública PNCP (fetch no navegador)
 └─ src/lib/store.ts  → IndexedDB (processos salvos, documentos + arquivos, perfil)
```

Removidos: `src/integrations/supabase/`, `supabase/`, `AuthContext`, `ProtectedRoute`,
`Login`, `searchApi.ts`, `.env`, dependência `@supabase/supabase-js`, `lovable-tagger`.

Roteamento passa a `HashRouter` (GitHub Pages não reescreve rotas; evita 404 ao recarregar).
`vite.config.ts` recebe `base: './'`.

## Busca — `src/lib/pncp.ts`

- Endpoint: `GET https://pncp.gov.br/api/consulta/v1/contratacoes/proposta`
  com `dataFinal` (AAAAMMDD; padrão hoje + 365 dias, ou "Fechamento (fim)" do filtro),
  `codigoModalidadeContratacao`, `uf`, `pagina`, `tamanhoPagina=50`.
- Modalidades na tela = lista oficial da Lei 14.133 com códigos PNCP
  (1 Leilão eletrônico, 2 Diálogo competitivo, 3 Concurso, 4 Concorrência eletrônica,
  5 Concorrência presencial, 6 Pregão eletrônico, 7 Pregão presencial, 8 Dispensa,
  9 Inexigibilidade, 10 Manifestação de interesse, 11 Pré-qualificação,
  12 Credenciamento, 13 Leilão presencial). Remove "Tomada de Preços" e "Convite".
- "Todas modalidades" → consulta as 13 em paralelo (lotes de 4).
- Busca incremental: cada clique em "Buscar" lê um lote de páginas (até 5 por
  modalidade); "Buscar mais" lê o próximo lote. A tela mostra "X de Y editais analisados"
  usando `totalRegistros`. Sem mais páginas → botão some.
- Filtros locais (sobre o que foi lido): palavras-chave (todas, sem acento/caixa),
  excluir termos, cidade, órgão, SRP, valor mín/máx, datas de abertura/fechamento.
- "Situação" (mantido, com opções novas) escolhe o endpoint:
  - **Abertas — recebendo propostas** (padrão) → `/v1/contratacoes/proposta` (acima).
  - **Encerradas** (prazo de proposta já passou), **Revogadas** (situacaoCompraId 2),
    **Anuladas** (3), **Suspensas** (4) e **Todas** → `/v1/contratacoes/publicacao`
    com `dataInicial`/`dataFinal` = período de publicação. Na tela, quando a situação não
    é "Abertas", aparecem os campos "Publicação (início/fim)"; padrão últimos 90 dias.
    A API rejeita período > 365 dias (422): a tela valida antes e avisa.
    Filtro de situação aplicado localmente por `situacaoCompraId` / `dataEncerramentoProposta`.
  - Detalhe exibe "Valor homologado" quando `valorTotalHomologado` existir.
- Erros: timeout 30s por requisição, 1 nova tentativa; falhas aparecem no aviso de fontes
  ("PNCP: erro — mensagem"), nunca como lista vazia silenciosa.
- Normalização mantém o tipo `NormalizedProcess` existente; link externo =
  `https://pncp.gov.br/app/editais/{cnpj}/{ano}/{sequencial}` (ou `linkSistemaOrigem`).

## Dados locais — `src/lib/store.ts`

IndexedDB nativo (wrapper fino próprio, sem biblioteca extra) com os stores:

| store | chave | conteúdo |
|---|---|---|
| `processes` | `source_externalId` | `NormalizedProcess` + `funnel_stage`, `is_favorite`, `in_funnel`, `notes`, `linked_doc_ids[]`, `created_at` |
| `documents` | uuid | `name`, `category`, `expiry_date`, `notes`, `created_at`, `file` (Blob, nome, tipo) |
| `settings` | `"profile"` | `full_name`, `company_name`, `cnpj`, `email` |

Funções: `getProcess`, `listProcesses`, `upsertProcess`, `updateProcess`, `deleteProcess`,
`listDocuments`, `addDocument`, `deleteDocument`, `getDocumentFileUrl` (object URL),
`getSettings`, `saveSettings`, `exportBackup` (JSON; arquivos em base64), `importBackup`.

Favoritar sem estar no funil é permitido (`in_funnel=false`); o Funil e o Dashboard
listam só `in_funnel=true`.

## Telas

- **Dashboard / Funil / Documentos / Detalhe / Buscar:** trocam chamadas Supabase pelas
  funções acima; sem mudança visual. Detalhe abre pelo store ou pelo `sessionStorage`
  (como hoje).
- **Configurações:** perfil + empresa locais, mais seção "Backup" (Exportar / Importar)
  e aviso de que os dados ficam neste navegador.
- **Sidebar:** remove "Sair".
- Remove a exigência "Configure sua empresa primeiro" para salvar/favoritar.

## Testes

- Vitest: `pncp.ts` (URL montada, normalização, filtros locais, mapeamento de modalidades,
  tratamento de 204/400) com `fetch` simulado; `store.ts` com `fake-indexeddb`
  (CRUD, backup ida e volta).
- Verificação manual em navegador (build de produção): busca real no PNCP com e sem UF,
  salvar no funil, mover etapa, anexar e abrir documento, recarregar a página, exportar
  e importar backup.

## Publicação

- Remover `.env` do repositório; tornar o repo público.
- GitHub Actions: `npm ci && npm test && npm run build` → deploy em GitHub Pages.
- URL: `https://guripgt.github.io/licita-es-havana/`.

## Fora do escopo

Login, sincronização entre dispositivos, Compras.gov, alertas/notificações.
