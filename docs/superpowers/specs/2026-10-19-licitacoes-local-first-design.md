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

## Atualização 2026-10-20 — busca do portal

A busca por palavra pela API de consultas era lenta (baixava todos os editais da UF em páginas de 50
e filtrava no navegador). Agora a busca principal usa a mesma API do portal (`/api/search/`,
`Accept: application/json`), que filtra no servidor e responde em < 1 s:

- `q` = palavras de "Buscar no objeto" (aspas = frase exata). "Excluir termos" é aplicado no navegador:
  no portal, `-termo` não exclui (vira termo obrigatório).
- `status`: abertas → `recebendo_proposta`; **em julgamento** (nova opção) → `propostas_encerradas`;
  encerradas → `encerradas`; todas → `todos`.
- `ufs`, `modalidades`, `tipos_documento=edital`, `ordenacao=-data`, `tam_pagina=100`.
- Filtros sem equivalente no servidor (cidade, órgão, SRP, valor, datas) são aplicados no navegador;
  com eles ativos, o app lê páginas automaticamente até achar 50 resultados (máx. 20 páginas por clique).
- Período de publicação sem palavra-chave (em situações ≠ abertas) e revogadas/anuladas/suspensas vão direto para a API
  oficial de consultas, que filtra no servidor (limite de 365 dias mantido). A busca do portal ordena por
  atualização e só pagina até 10.000 resultados; ao atingir o limite, o selo avisa para refinar.
- Frases entre aspas funcionam na busca e na exclusão (local); a busca repete até 2 vezes (300 ms, 1 s) quando
  o servidor derruba a conexão ou demora mais de 20 s.
- **Plano B:** se a primeira página da busca do portal falhar, `src/lib/search.ts` usa a API de
  consultas (motor anterior) e o selo mostra "PNCP (modo alternativo)".
- Selo de situação na tabela: Recebendo propostas / Prazo encerrado / Revogada / Anulada / Suspensa,
  calculado no horário local.

## Atualização 2026-10-20 — itens encontrados na busca

Com palavra-chave, cada processo da lista ganha uma linha cinza com os itens do edital cuja descrição
contém todas as palavras buscadas (sem acento/caixa; aspas = frase): número, descrição (truncada,
completa no tooltip), quantidade + unidade, valor unitário e total ("Sigiloso" quando o orçamento é
sigiloso). Até 5 itens, com "ver mais N itens".

- Fonte: `GET https://pncp.gov.br/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens?pagina=N&tamanhoPagina=500`
  (`src/lib/pncpItems.ts`); CNPJ/ano/sequencial vêm do número de controle do PNCP.
- Cache por compra durante a sessão; no máximo 6 compras consultadas ao mesmo tempo; 1 nova
  tentativa em falha de conexão; erro mostra "Tentar de novo".
- Quando nenhum item tem a palavra (ela está em outro campo do edital), a linha avisa.
- A linha fica presa à área visível da tabela (`container-type: inline-size` + `100cqi`), para os
  valores aparecerem sem rolagem horizontal.
