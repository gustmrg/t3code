# Plano 003 — Consolidar sessões com terminal principal e preparar o modo Chat

> **Instruções ao executor:** leia este arquivo inteiro antes de implementar. Ele contém o contexto necessário sem depender da conversa que o originou. Execute as fases em ordem, valide cada uma e registre o resultado no checklist final. Implemente no fork e na linhagem indicados abaixo. Não publique, faça push, crie PR ou commit automaticamente.

## 1. Identificação e base correta

- **Estado:** DONE — implementação e verificação automatizada concluídas em 2026-09-06; validação visual integrada pendente (sem autorização de browser/computer use).
- **Data:** 2026-09-06.
- **Prioridade:** P1 para a correção de worktree; P2 para as demais correções; evolução de produto para identidade da sessão e interface.
- **Esforço:** L, dividido em seis fases verificáveis. Não é apenas uma alteração de CSS.
- **Risco:** médio, concentrado no ciclo de vida do PTY e na propagação de metadados duráveis.
- **Fork:** `https://github.com/gustmrg/t3code`.
- **Clone de referência:** `/Users/gmiranda/Dev/oss-projects/t3code`.
- **Branch de destino funcional:** `feature/terminal-first-workspace`.
- **Commit analisado:** `30c0c7cadb824a959c553b9b25834be4b41aa7bc`.
- **Base dos seis commits revisados:** `f6f2be32d`.
- **Dependências:** os commits que já existem nessa branch. Os planos 001 e 002 sobre Kimi **não são dependências** deste plano e não devem ser reaplicados.

Na elaboração deste documento, o checkout físico estava em `personal`, HEAD `b4e964b9d`, com alterações locais preexistentes em `apps/web/src/components/settings/ProviderSettingsForm.test.ts` e `apps/web/src/components/settings/providerDriverMeta.ts`. A branch correta foi lida pelo ref `origin/feature/terminal-first-workspace`, sem checkout. **Não implemente sobre `personal`, não carregue suas alterações para outra branch por engano e não use reset/stash para limpar o diretório.**

Todos os caminhos de código abaixo são relativos à raiz do checkout de implementação, para permitir um worktree isolado. As referências de linha dizem respeito ao commit analisado, não aos arquivos atualmente abertos em `personal`.

Antes de editar:

```sh
git status --short --branch
git worktree list
git rev-parse HEAD
git show --no-patch --format=fuller 30c0c7cadb824a959c553b9b25834be4b41aa7bc
git diff --stat 30c0c7cadb824a959c553b9b25834be4b41aa7bc..HEAD -- packages/contracts/src packages/client-runtime/src apps/server/src apps/web/src apps/mobile/src/features/threads docs/internals/terminal-first-workspaces.md docs/user/terminal-workspaces.md
```

Se o checkout estiver em outra linhagem ou tiver trabalho alheio, use um worktree separado derivado de `origin/feature/terminal-first-workspace`, por exemplo com uma branch `feature/terminal-first-hardening`. Não faça merge de `personal` nem atualize upstream como parte desta tarefa. Se a branch correta avançou, confronte os trechos deste plano com a nova revisão; adaptar números de linha é rotina, mas reconciliar alterações no modelo de execução vem antes da implementação.

Este documento é um artefato de trabalho solicitado pelo usuário. Mantê-lo local; a implementação deve atualizar a documentação durável em `docs/`. Não incluir automaticamente `plans/` nos commits.

## 2. Resultado de produto esperado

O usuário está construindo uma ADE para uso pessoal, com agentes CLI e worktrees locais. Deseja manter a organização de projetos e sessões da sidebar do T3 Code, usando a área central como um workspace de abas:

```text
Sidebar                         Workspace da sessão selecionada
Projeto A                       [Terminal] [arquivo.ts ×] [Changes ×]
  Sessão: corrigir login        Terminal · Chat — Coming soon (desabilitado)
  Sessão: revisar testes        ┌─────────────────────────────────────────┐
Projeto B                       │ CLI interativo OU arquivo/diff da aba   │
  Sessão: nova tarefa           │ ativa, ocupando a área central          │
                                └─────────────────────────────────────────┘
```

Decisões de escopo:

1. Uma nova sessão terminal-first tem **um terminal principal identificado e persistido**, que executa shell ou o CLI configurado. Vários agentes simultâneos são atendidos por várias sessões; não construir agora uma nova hierarquia de agentes filhos na sidebar.
2. A aba principal é fixa. Abrir arquivos, diffs e previews cria/ativa outras abas centrais sem encerrar nem relançar o CLI.
3. `Terminal` é a visualização disponível da execução. `Chat` aparece desabilitado com indicação de funcionalidade futura. Não construir espelhamento, importação de histórico nem input de chat nesta entrega.
4. Não confundir esse futuro Chat com o chat estruturado que o T3 já oferece. O chat existente permanece funcional nas threads tradicionais; ele não deve ser iniciado implicitamente dentro das novas sessões terminal-first.
5. Manter a preferência por aplicativo/projeto da branch. Ela determina **novas** sessões. Não transformar todas as threads antigas nem alterar retroativamente o agente de sessões existentes quando a preferência mudar.
6. Web e desktop são os clientes de implementação principal. Manter compatibilidade de contratos com mobile e mostrar indisponibilidade explícita ao abrir nele uma sessão que exige terminal. Não implementar terminal nativo mobile.
7. Não adicionar hooks em configurações globais, daemon, multiplexador externo, CLI próprio da ADE ou dependência de serviço externo.

## 3. Estado atual e evidências

### 3.1. Partes da branch que devem ser mantidas

- `packages/contracts/src/threadLaunch.ts`: `TerminalStartup` é uma união com `_tag: "shell"` ou `_tag: "agent"` e `providerInstanceId`. Reutilizar esse contrato.
- `packages/client-runtime/src/threadLaunchPreference.ts`: resolução projeto → aplicação → defaults, com fallback de capacidade e provider indisponível. Manter a função compartilhada e pura.
- `apps/web/src/lib/newThreadLaunch.ts`: coordena materialização, navegação e abertura, com deduplicação inicial por `scopedThreadKey`.
- `apps/server/src/ws.ts`: resolve o provider no environment proprietário e usa o bootstrap existente de worktree/setup, sem iniciar um turn de provider.
- `apps/server/src/terminal/Manager.ts`: PTY, streams, histórico e attach já existem. Não criar outro gerenciador de processos.
- `apps/web/src/rightPanelStore.ts`: surfaces de terminal/arquivo/diff/preview; `panelFirstByThreadKey` é persistido separadamente de maximização manual. Manter essa separação.
- `apps/web/src/workspaceActionBus.ts`: a command palette emite intenção e `ChatView` aplica a ação. Manter uma única implementação do comportamento.
- `docs/internals/terminal-first-workspaces.md` e `docs/user/terminal-workspaces.md`: documentam a branch, inclusive a independência atual entre CLI e chat estruturado. Atualizar a descrição que será superada por este plano.

### 3.2. Worktree: existência da thread não significa contexto final disponível

Em `apps/web/src/lib/newThreadLaunch.ts:98–106`:

```ts
const materialized = await input.operations.materialize(input.materializeInput);
// ... trata Failure, mas descarta materialized.value ...
const thread = await input.operations.waitForThreadShell(input.threadRef);
await input.operations.navigateToThread(input.threadRef);
const terminalInput = input.operations.terminalInput(thread);
```

Em `apps/web/src/state/entities.ts:249`, `waitForThreadShell` resolve imediatamente se encontrar qualquer thread no atom. Em `apps/web/src/hooks/useHandleNewThread.ts:567`, o diretório é calculado por `worktreePath ?? project.workspaceRoot`.

O bootstrap em `apps/server/src/ws.ts:1119–1184` emite `thread.create`, cria o worktree e depois emite `thread.meta.update` com o caminho. Retorna `{ sequence }`. O stream de shell usa coalescência de eventos. É possível receber o resultado da RPC com a primeira projeção já carregada e a atualização final ainda pendente.

**Reprodução já feita na revisão:** coordenador real do commit carregado em memória, transporte/projeção simulados; a confirmação tinha sequence 12, a thread local ainda tinha `worktreePath: null`, e o terminal abriu `/repo` antes de chegar `/repo-worktrees/task`. Não foi uma execução integrada da interface. Criar a regressão permanente na fase 1.

### 3.3. Retry: a mesma abertura pode escrever duas vezes no CLI

`apps/server/src/ws.ts:605` chama `launchAgent` depois de `open`, inclusive quando `open` reutiliza o PTY vivo. Em `apps/server/src/terminal/Manager.ts:2385`:

```ts
try: () => process.write(`${commandLine}\r`)
```

O lock serializa a escrita, mas não evita uma segunda escrita. `useHandleNewThread.ts:669` mantém `Try again` acionável enquanto a Promise está pendente. Dois cliques podem enviar o segundo comando ao prompt do agente. O scheduler do cliente também serializa, sem deduplicar.

Não atribuir isso a retry automático do transporte: esse retry está desabilitado. O gatilho reproduzível é repetição da ação do usuário ou resultado de lançamento desconhecido após perda de resposta.

### 3.4. Controles ainda presos ao drawer e fechamento destrutivo

- `ChatView.tsx:3001`: `toggleTerminalVisibility` opera o drawer antigo e pode alocar outro terminal.
- `ChatView.tsx:6908` e `7300`: drawer permanece dentro da coluna de chat, que fica com largura zero no painel maximizado.
- `packages/shared/src/keybindings.ts:23`: `mod+j` aciona `terminal.toggle`.
- `ChatView.tsx:3549` e `3577`: criação e split alocam IDs adicionais.
- `ChatView.tsx:3774–3780`: cleanup de surface terminal chama `terminal.close` com `deleteHistory: true`; ações de fechar outras/todas as abas passam por esse cleanup.
- `ThreadTerminalDrawer.tsx:1541` e `1570`: saída de sessão chega a callbacks de fechamento. O terminal principal precisa de uma política diferente.

O drawer oculto é um comportamento herdado agora exposto pelo fluxo padrão. A ausência de identidade principal é uma lacuna em relação ao produto desejado, não uma falha de persistência já existente no store.

## 4. Modelo alvo e invariantes

### 4.1. Vínculo durável mínimo

Acrescentar um campo opcional/nullable `terminalWorkspace` à thread, propagado pelo sistema de eventos e projeções. Forma conceitual; os schemas reais devem seguir Effect/Schema:

```ts
type TerminalWorkspaceBinding = {
  mainTerminalId: string;
  startup: TerminalStartup;
};
// Na thread, shell e projeção: terminalWorkspace ausente/null = thread tradicional.
```

- `mainTerminalId` identifica o recurso terminal, não a aba React nem o PID. Pode usar `DEFAULT_TERMINAL_ID` na criação de uma nova thread vazia, mas não inferir que qualquer `term-1` existente já é principal.
- `startup` é a escolha efetiva capturada para essa sessão. É intenção de lançamento, não prova de qual processo está em execução. Não duplicar credenciais, command line ou environment nesse campo.
- A identidade completa no cliente usa `(environmentId, threadId, mainTerminalId)`. No servidor, o environment é implícito na instância. Não usar apenas `threadId` em caches compartilhados entre environments.
- Usar metadados duráveis existentes da thread; uma coluna JSON nullable na projeção é suficiente. Não criar outro banco, um grande framework de sessões ou persistência de PID como identidade.
- Ausência do campo em eventos/snapshots antigos decodifica como ausência/null. Nunca interpretar ausência como permissão para migrar a thread automaticamente.
- Commands de atualização devem ter semântica definida: `undefined` preserva o vínculo; a vinculação inicial é permitida; remover/substituir um vínculo principal já persistido é rejeitado nesta entrega. Alterar uma preferência global não remove esse vínculo.
- A atualização de `startup`, se oferecida, é uma ação explícita da própria sessão; não reinicia um processo vivo por efeito colateral. Não adicionar um novo seletor amplo só para preencher esse caso; a ação de recuperação existente pode manter a escolha ou abrir Settings.

### 4.2. Apresentação e execução têm ciclos de vida separados

| Ação                                                   | Resultado exigido                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Criar sessão terminal-first                            | Materializar workspace correto, persistir vínculo, abrir terminal principal uma vez e aplicar layout central.             |
| Selecionar outra sessão e voltar                       | Reanexar ao mesmo recurso; zero reinicializações por troca de seleção.                                                    |
| Abrir arquivo/diff/preview                             | Outra aba central; terminal continua executando em segundo plano.                                                         |
| `Cmd+J`, botão Terminal ou ação equivalente da palette | Ativar/focar a aba principal; quando já ativa, focar novamente. Não alternar um drawer invisível.                         |
| Fechar arquivo/fechar outras/fechar todas              | Operar apenas abas fecháveis. A principal fica presente e nunca entra no cleanup de processos.                            |
| Esconder superfície/sheet ou desmontar React           | Apenas apresentação/subscrição. Não chamar close/restart do PTY.                                                          |
| CLI termina e devolve controle ao shell                | Manter shell e aba. Não relançar agente automaticamente.                                                                  |
| Shell termina                                          | Manter aba e histórico disponível com estado encerrado e ação explícita de iniciar novamente.                             |
| Reiniciar terminal principal                           | Ação explicitamente nomeada, com confirmação se houver processo vivo; preservar o vínculo e trocar a geração de execução. |
| Excluir a thread                                       | Usar fluxo existente de exclusão/cleanup; aí o terminal pode ser encerrado.                                               |
| Reiniciar backend                                      | Vínculo durável continua. PTY/conversa não têm promessa de sobrevivência; não relançar CLI automaticamente ao renderizar. |

O contrato é **um terminal interativo principal por nova sessão terminal-first**. Desabilitar criação/split de terminais auxiliares pelo workspace dessas sessões nesta entrega. Não impor uma restrição global de um PTY por thread: terminais internos de scripts/setup e recursos legados podem existir e não devem ser mortos ou convertidos em principal. Threads tradicionais preservam seus terminais múltiplos.

### 4.3. Preparação suficiente para o Chat futuro

- O vínculo persistido estabelece de qual execução uma visualização futura seria derivada.
- Documentar em `docs/internals/terminal-first-workspaces.md` uma extensão futura `NativeConversationRef` com provider-instance + ID nativo de conversa, associada à execução correta no environment. Esse ID é diferente de `threadId`, `terminalId`, PID e `providerInstanceId`.
- **Não implementar campo com ID inventado, parser, watcher, importador, adaptador vazio ou RPC de chat apenas para “preparar”.** Sem integração confiável para descobrir o ID nativo, a referência continua ausente.
- A fase futura começará pela descoberta do ID nativo e leitura de histórico estruturado do provider. Buffer ANSI do PTY não é uma fonte confiável de mensagens, ferramentas ou aprovações.
- O primeiro Chat futuro poderá ser somente leitura. Input compartilhado e alternância de controle dependerão de suporte real do provider e política de um único escritor. Não prometer que toda CLI conseguirá alternância bidirecional.
- Não iniciar o adaptador de chat atual como uma segunda execução e chamá-lo de mesma sessão. Nesta entrega, capacidade de Chat dessas sessões é sempre indisponível.

## 5. Convenções, escopo e verificações

### Convenções que o executor deve seguir

O projeto usa TypeScript, React 19, Zustand para layout, Effect/Atom para estado e comandos, servidor Node com Effect e SQLite, e contratos Effect/Schema. A raiz declara Node `^24.13.1`, pnpm `11.10.0` e Vite Plus (`vp`). Consultar os arquivos da **branch alvo**, pois o checkout `personal` usa uma base anterior.

- Backend: seguir `Effect.fn`, serviços e locks de `Manager.ts`; ler a referência local de Effect indicada pelo repositório antes de criar código Effect. Nunca chamar uma função que toma o mesmo lock dentro de uma região já travada; usar helpers `...Locked`.
- Eventos: mudanças de thread passam por command → decider → evento → projector → persistência/snapshot. Não editar somente a tabela SQLite ou somente o atom do frontend.
- Schema exemplar: `TerminalStartup` em `packages/contracts/src/threadLaunch.ts` usa `Schema.TaggedStruct` e tipos derivados. Não criar cópias divergentes no frontend.
- Testes web: `newThreadLaunch.test.ts` usa `describe/it/expect/vi` de `vite-plus/test`; `PanelLayoutControls.test.tsx` usa `renderToStaticMarkup` para contrato de renderização.
- Testes backend: `Manager.test.ts` usa `it.effect`, `FakePtyAdapter`, `process.writes` e `spawnInputs`; `server.test.ts` usa `buildAppUnderTest` e cliente RPC. Testar o coordenador e os efeitos reais relevantes, não somente mocks que repetem a implementação.
- Migração exemplar: `044_ProjectionProjectThreadLaunchPreference.ts` e seu teste usam coluna JSON nullable e `NodeSqliteClient.layerMemory()`. Criar a próxima migração disponível, sem editar a 044.
- Esperas de consistência: receipts/subscrições e `Deferred`/drains em testes, sem sleeps ou polling para ordenar eventos.

### Arquivos em escopo

Modificar somente os grupos abaixo e seus testes locais necessários. Novos arquivos devem ficar no grupo responsável pelo comportamento, sem reorganização geral de pastas:

| Grupo                   | Arquivos/pontos de extensão                                                                                                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contratos               | `packages/contracts/src/{threadLaunch,terminal,orchestration,environment,index}.ts` e respectivos testes.                                                                                                                                                       |
| Cliente compartilhado   | `packages/client-runtime/src/operations/commands.ts`, `src/state/{threadCommands,threadReducer,shellReducer,threadShell,models,entities,terminal,terminalSession}.ts`, `src/threadLaunchPreference.ts` e testes. Alterar apenas propagação/política necessária. |
| Bootstrap e capacidades | `apps/server/src/ws.ts`, `apps/server/src/server.test.ts`, `apps/server/src/environment/ServerEnvironment.ts`.                                                                                                                                                  |
| Orquestração            | `apps/server/src/orchestration/{decider,projector,commandInvariants,Schemas,Normalizer}.ts`, `Layers/{ProjectionPipeline,ProjectionSnapshotQuery}.ts` e testes correspondentes.                                                                                 |
| Persistência            | `apps/server/src/persistence/Services/ProjectionThreads.ts`, `Layers/ProjectionThreads.ts`, `Migrations.ts`, nova `Migrations/045_ProjectionThreadTerminalWorkspace.ts` e teste — usar outro número se 045 já estiver ocupado.                                  |
| PTY                     | `apps/server/src/terminal/Manager.ts`, seu serviço/tipos já presentes no mesmo diretório e `Manager.test.ts`; adapters de PTY somente se indispensável ao ciclo de vida existente.                                                                              |
| Criação/estado web      | `apps/web/src/lib/newThreadLaunch.ts`, `hooks/useHandleNewThread.ts`, `state/{entities,shell,threads,terminal,terminalSessions}.ts`, `rightPanelStore.ts`, `rightPanelLayout.ts`, `workspaceActionBus.ts` e testes.                                             |
| Interface web           | `components/{ChatView,RightPanelTabs,RightPanelSheet,ThreadTerminalDrawer,CommandPalette}.tsx`, `components/chat/PanelLayoutControls.tsx`; pequenos helpers/componentes de política em `lib/` e `components/chat/` com testes.                                  |
| Compatibilidade mobile  | `apps/mobile/src/features/threads/ThreadDetailScreen.tsx`, `threadContentPresentation.ts` e testes: apenas estado indisponível para sessão terminal e preservação do chat tradicional.                                                                          |
| Documentação            | `docs/internals/terminal-first-workspaces.md`, `docs/user/terminal-workspaces.md`; este plano e índice local somente para status.                                                                                                                               |

Fixtures/tipos de consumidores diretos de contratos podem precisar de ajustes mecânicos, inclusive mobile/desktop. Isso é permitido para manter compilação; não transformar tais ajustes em novas features. Os números de linha não são fronteiras de escopo.

**Fora de escopo:** nova sidebar, rebranding, reescrita de `ChatView`, substituição do renderer de terminal, implementação Kimi, alterações em autenticação/credenciais globais, novos providers, shell hooks, transcript ingestion, MCP, tmux, persistência de processos através da morte do backend, edição de `.github/workflows/personal-desktop-build.yml`, publicação e atualização de dependências.

### Comandos de verificação

Os scripts e projetos abaixo foram conferidos na revisão da branch. **Não foram executados durante a escrita do plano.** Estabelecer baseline no checkout correto antes de mudar código. Usar `vp i` apenas se as dependências não estiverem preparadas; não atualizar lockfile nem instalar CLIs de agentes para os testes.

Executar cada comando a partir do diretório indicado:

| ID  | Diretório                 | Comando                                                                                                                                                                                                                                                                             | Sucesso esperado                                                                                               |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| W1  | `apps/web`                | `vp test run --project unit src/lib/newThreadLaunch.test.ts src/state/entities.test.ts`                                                                                                                                                                                             | Testes de coordenação e espera passam; criar `entities.test.ts` se ausente.                                    |
| W2  | `apps/web`                | `vp test run --project unit src/rightPanelStore.test.ts src/workspaceActionBus.test.ts src/components/ThreadTerminalDrawer.test.ts src/components/RightPanelTabs.test.tsx src/components/chat/PanelLayoutControls.test.tsx`                                                         | Testes de layout/ciclo de vida e controles passam.                                                             |
| W3  | `apps/web`                | `vp test run --project unit src/lib/terminalWorkspaceActions.test.ts src/components/chat/WorkspaceModeControl.test.tsx`                                                                                                                                                             | Novos testes de política e botão passam; os nomes são os propostos neste plano.                                |
| C1  | `packages/contracts`      | `vp test run src/terminal.test.ts src/orchestration.test.ts src/threadLaunch.test.ts`                                                                                                                                                                                               | Contratos novos, eventos antigos e defaults passam; criar `threadLaunch.test.ts` se ausente.                   |
| R1  | `packages/client-runtime` | `vp test run src/state/shellReducer.test.ts src/state/threadReducer.test.ts src/state/terminalSession.test.ts src/threadLaunchPreference.test.ts`                                                                                                                                   | Metadados preservados, estado remoto e preferências compatíveis.                                               |
| S1  | `apps/server`             | `vp test run src/terminal/Manager.test.ts`                                                                                                                                                                                                                                          | Duplicação, concorrência, attach, encerramento e falhas passam com PTY fake.                                   |
| S2  | `apps/server`             | Comando S2 abaixo                                                                                                                                                                                                                                                                   | Rotas de terminal e materialização/bootstrap relevantes passam. Nomear os novos casos para entrarem no filtro. |
| S3  | `apps/server`             | `vp test run src/orchestration/terminalWorkspace.test.ts src/orchestration/projector.test.ts src/orchestration/Layers/ProjectionPipeline.test.ts src/orchestration/Layers/ProjectionSnapshotQuery.test.ts src/persistence/Migrations/045_ProjectionThreadTerminalWorkspace.test.ts` | Round-trip, replay, projeções e migração passam. Ajustar só o número da migração se necessário.                |
| M1  | `apps/mobile`             | `vp test run src/features/threads/threadContentPresentation.test.ts`                                                                                                                                                                                                                | Sessão terminal indisponível explicitamente, chat tradicional intacto.                                         |
| T1  | raiz                      | `vp run --filter @t3tools/contracts typecheck`                                                                                                                                                                                                                                      | Exit 0.                                                                                                        |
| T2  | raiz                      | `vp run --filter @t3tools/client-runtime typecheck`                                                                                                                                                                                                                                 | Exit 0.                                                                                                        |
| T3  | raiz                      | `vp run --filter t3 typecheck`                                                                                                                                                                                                                                                      | Exit 0.                                                                                                        |
| T4  | raiz                      | `vp run --filter @t3tools/web typecheck`                                                                                                                                                                                                                                            | Exit 0.                                                                                                        |
| T5  | raiz                      | `vp run --filter @t3tools/mobile typecheck`                                                                                                                                                                                                                                         | Exit 0 se contratos/UI mobile forem alterados, como previsto.                                                  |
| L1  | raiz                      | Script de lint focado abaixo                                                                                                                                                                                                                                                        | Exit 0, sem `--fix`; inclui arquivos novos e alterações desde a base.                                          |
| D1  | raiz                      | `git diff --check`                                                                                                                                                                                                                                                                  | Exit 0, sem whitespace inválido.                                                                               |

W1/W3/C1/S3 incluem arquivos que serão criados: na baseline, execute apenas os que já existirem; depois da fase correspondente, os arquivos novos devem existir e entrar no comando. Não usar `--passWithNoTests` para mascarar filtro errado. Não rodar `vp check`, testes/typecheck de todo o monorepo ou builds de distribuição: o foco é o escopo alterado.

S2, a partir de `apps/server`:

```sh
vp test run src/server.test.ts -t 'terminal|materializ|bootstrap'
```

L1, na raiz do checkout isolado de implementação:

```sh
python3 - <<'PY'
from pathlib import Path
import subprocess

base = "30c0c7cadb824a959c553b9b25834be4b41aa7bc"
tracked = subprocess.check_output(
    ["git", "diff", "--name-only", "--diff-filter=ACMR", "-z", base]
).decode().split("\0")
untracked = subprocess.check_output(
    ["git", "ls-files", "--others", "--exclude-standard", "-z"]
).decode().split("\0")
paths = sorted({p for p in tracked + untracked
                if p.endswith((".ts", ".tsx")) and Path(p).is_file()})
if not paths:
    raise SystemExit("Nenhum arquivo TypeScript encontrado: conferir checkout e diff.")
subprocess.run(["vp", "lint", "--report-unused-disable-directives", *paths], check=True)
PY
```

Se a base efetiva foi reconciliada com commits posteriores, substituir somente `base` pela revisão registrada para a implementação, para não lintar mudanças alheias. O script não formata nem corrige arquivos.

## 6. Fases de implementação

### Fase 1 — Corrigir a barreira de materialização

1. Tornar explícito no coordenador o retorno `{ sequence }` de `materialize`, removendo o `unknown` nesse limite. Manter a RPC existente; não redesenhar o envelope global de dispatch.
2. Substituir a espera por mera existência por uma espera do snapshot de shell do **mesmo environment** com `snapshotSequence >= receipt.sequence`, contendo a thread. `apps/web/src/state/shell.ts` já exporta `environmentSnapshotAtom`; ler thread e sequência do mesmo snapshot aceito, evitando combinar atoms em revisões distintas.
3. O helper recebe o ref, a sequência mínima e cancelamento. Usar subscrição com leitura imediata e nova leitura após registrar o listener para fechar a corrida de subscribe. Limpar listeners em sucesso, falha terminal, remoção da thread/environment e cancelamento. Uma desconexão transitória pode aguardar ressincronização; não pode abrir no diretório raiz como fallback.
4. Só derivar o `TerminalOpenInput` depois dessa barreira. Quando `prepareWorktree` foi solicitado, `worktreePath` final deve ser não nulo; caso contrário, retornar erro recuperável sem abrir PTY. O modo explicitamente local continua aceitando caminho nulo e usa a raiz do projeto.
5. Tratar falhas/cancelamento da espera no resultado discriminado do coordenador. Não deixar Promise rejeitada sem tratamento nem conservar entrada presa no mapa de lançamentos.
6. Recuperação de uma espera falha deve reaguardar a thread já materializada; não disparar `thread.materialize` novamente. Ao navegar para outra sessão durante a criação, não roubar o foco ao concluir a operação antiga.
7. Preservar a semântica atual de setup: o bootstrap solicita o script e registra seu início; não presumir que a conclusão da materialização significa que o script já terminou. Não inserir espera pelo término de todos os scripts nesta fase.

**Testes obrigatórios:** projeção inicial sem worktree seguida da RPC e da projeção final; confirmação já refletida no snapshot; eventos coalescidos com sequência maior; modo local; outro environment com mesmo threadId; cancelamento; erro do stream; thread removida; sucesso da RPC seguido de espera/retry sem nova materialização. Antes da projeção válida, `openTerminal` deve ter **zero** chamadas; depois, exatamente uma com o worktree correto.

**Verificar:** W1 e T4; se o helper for movido ao runtime compartilhado, adicionar seu teste lá e executar também R1/T2. Usar eventos controlados/Deferred, não tempo de relógio como sincronização.

### Fase 2 — Tornar o lançamento do CLI idempotente por execução do terminal

1. Reorganizar `ws.openTerminal` e `TerminalManager` para que abrir/reutilizar o PTY e decidir se pode lançar o agente sejam uma operação protegida. Resolver metadata confiável pelo registry no servidor; manter command/args/env fora do input arbitrário do browser.
2. Reutilizar o lock por thread do Manager com helpers internos sem lock recursivo. A guarda deve ser verificada **antes** de `openLocked` poder reiniciar um PTY vivo por mudança de env/cwd. Um retry ou attach não pode matar um agente porque Settings ou projeções mudaram.
3. Manter no runtime do terminal um registro por geração de processo: nenhuma tentativa, falha antes da escrita, escrita tentada, comando submetido, ou resultado incerto. Reutilizar uma identidade/generation já existente se adequada; caso contrário, acrescentar token interno renovado somente no spawn de um novo shell. Não usar PID isolado nem persistir esse estado como se sobrevivesse ao backend.
4. Se o CLI já foi submetido nessa geração, pedidos repetidos devolvem o snapshot/resultado existente, sem nova escrita. Isso vale mesmo se o cliente apresentar outro ID de tentativa ou se a label/atividade do processo tiver mudado. `open + launch` concorrentes devem ter um único vencedor.
5. Falhas comprovadamente anteriores à escrita, como executável inexistente, admitem nova tentativa no mesmo shell quando seguro. Se o shell já recebeu input de usuário/está ocupado desde a tentativa, não presumir prompt livre para injetar comando; orientar reinício explícito ou uso manual da shell. Depois de escrita com resultado incerto, nunca retransmitir automaticamente: exigir nova geração por ação explícita.
6. Preflight e escrita devem ficar associados à mesma geração. Um retorno tardio de verificação não pode ser aplicado a um PTY que foi reiniciado enquanto ela estava em andamento. Não segurar lock durante uma RPC ou callback que dependa dele próprio.
7. Expor na resposta apenas o necessário para recuperação, por exemplo uma política opcional `retryPolicy: "retry" | "restart-required" | "none"`, com decoding compatível. Não expor comandos completos, environment, paths de credenciais ou segredos nos snapshots. Se os campos atuais bastarem para uma decisão inequívoca, evitar duplicá-los.
8. No cliente, coalescer/desabilitar `Try again` enquanto pendente e fechar o toast após conclusão. Não confiar nessa proteção como substituta da guarda do servidor.
9. Manter `started` compatível com a branch, documentando que significa comando submetido ao terminal, não autenticação, readiness ou conversa nativa identificada. Não deduzir readiness por texto ANSI. Falhas reais da CLI após execução permanecem visíveis no terminal.
10. Reinício deliberado usa a operação explícita de restart, conserva `mainTerminalId` e reinicializa a guarda para a nova geração. Abrir/reattach/renderizar nunca significa reiniciar.

**Testes obrigatórios:** duas chamadas sequenciais e concorrentes produzem um spawn e uma escrita; duas chamadas de retry pelo cliente; resposta perdida seguida de retry; falha de preflight seguida de retry válido; usuário digita na shell antes do retry; write lança erro após tentativa e não é repetido; Settings/env muda entre retries sem matar o processo; restart durante preflight; reinício explícito permite uma nova escrita; attach/resize após lançamento mantém o mesmo processo. Usar `FakePtyAdapter` e asserts sobre `writes`, `spawnInputs` e `killed`, sem chamar Codex/Claude reais.

**Verificar:** S1, S2, C1 se contrato mudar, W1, T1/T3/T4. Registrar quais testes cobrem a operação composta, para não ter somente mocks isolados de `open` e `launchAgent`.

### Fase 3 — Persistir o terminal principal na thread

1. Implementar `TerminalWorkspaceBinding` no grupo de contratos de thread launch e o campo `terminalWorkspace` em commands/payloads de criação e metadata, thread completa e shell. Exportar pelos pontos existentes. Não reutilizar `OrchestrationSession`, que descreve a sessão do provider estruturado.
2. Propagar o campo em `thread.materialize` → bootstrap `thread.create` → decider → evento → projector puro → `ProjectionPipeline` → repositório SQL → snapshots de thread/shell e seus caminhos paginados/HTTP. Procurar os mapeamentos de `worktreePath` como guia, mas não editar os de Git sem necessidade.
3. Criar migração aditiva nullable na `projection_threads`, registrar em `Migrations.ts` e cobrir upgrade de banco até 044, migração repetida pelo runner e preservação de linhas antigas. Não reescrever eventos antigos nem usar o banco pessoal como fixture.
4. Validar replay de `thread.created`/`thread.meta-updated` com e sem vínculo. Uma atualização de título, branch, pin ou worktree não pode apagar o vínculo por omissão.
5. Passar vínculo explícito na criação terminal-first com ID determinado uma vez e `startup` resolvido para a sessão. Após confirmação, UI e reabertura usam o vínculo do servidor, não a preferência global novamente.
6. Acrescentar capability de servidor `terminalWorkspaceSessions` (optional, ausência = false), seguindo `packages/contracts/src/environment.ts` e `apps/server/src/environment/ServerEnvironment.ts`. Cliente atualizado conectado a servidor antigo não pode supor suporte só porque recebeu sucesso de um command cujos campos novos foram ignorados. Informar atualização necessária; manter chat tradicional e o comportamento legado disponível, sem fingir vínculo durável.
7. Para threads antigas, não usar somente `panelFirstByThreadKey` como classificação: o usuário podia maximizar um chat tradicional. Acrescentar ao menu de uma aba terminal a ação explícita `Use as main terminal` apenas quando a thread não tem vínculo, não tem histórico estruturado nem sessão de provider estruturado. Persistir o ID selecionado, sem reiniciar o processo. Capturar `startup` do lançamento conhecido desse terminal; se não houver essa informação, usar shell, sem inferir a partir da preferência global atual. Validar a elegibilidade no servidor; duas vinculações concorrentes devem manter a primeira e rejeitar substituição. Em casos mistos, preservar a thread antiga e orientar criação de uma nova sessão terminal; não apagar mensagens nem converter silenciosamente.
8. Se existirem terminais auxiliares legados na conversão, preservá-los e deixá-los acessíveis como recursos legados fecháveis. A aba principal é o único terminal de trabalho novo; não criar mais auxiliares depois da conversão. Não escolher terminal de setup automaticamente como principal.
9. Acrescentar uma guarda específica para `thread.turn.start` quando a thread tem `terminalWorkspace`: rejeitar com erro de domínio explicando que Chat dessas sessões ainda não está disponível. Não iniciar adaptador estruturado por atalho, composer oculto ou cliente antigo. Preservar os fluxos tradicionais e a criação explícita de uma thread tradicional separada.

**Testes obrigatórios:** round-trip create/get/list/shell; snapshot inicial e evento incremental; replay antigo e novo; título/branch não apagam vínculo; campo não cruza environments; tentativa de remover/substituir vínculo rejeitada; preferência global muda sem trocar startup da sessão; capability ausente; conversão explícita conserva terminal e proíbe histórico/sessão estruturada; nova sessão terminal rejeita turn estruturado, thread tradicional aceita.

**Verificar:** C1, R1, S2, S3, T1/T2/T3/T4 e T5. Novo `src/orchestration/terminalWorkspace.test.ts` deve usar o decider/projector real e exemplos dos testes de metadados existentes, não uma implementação paralela para teste.

### Fase 4 — Unificar abas, foco e ciclo de vida do terminal principal

1. Extrair somente a pequena política necessária de `ChatView` para `lib/terminalWorkspaceActions.ts` e, se útil, um hook fino. Inputs: vínculo durável, surfaces e estado de terminal do mesmo ref. Outputs/ações: garantir surface, ativar/focar, indicar indisponibilidade ou solicitar início explícito. Não transferir toda a lógica de ChatView para um novo controller gigante.
2. Ao abrir uma sessão vinculada, garantir a aba `terminal:<mainTerminalId>` sem criar outro recurso. Reconciliar surfaces persistidas com o vínculo autoritativo; localStorage limpo ou uma aba faltante não significam nova sessão. A aba principal deve ser a primeira e não oferecer fechar/split.
3. Encaminhar `terminal.toggle`, botão do header, command palette, menu de abas e ações do workspace para essa política. No modo terminal-first, ocultar/desabilitar `New terminal` e split, ou fazer `Open terminal` apenas focar a principal. Não reconfigurar os atalhos das threads tradicionais.
4. Enquanto o workspace principal estiver ativo, impedir que ações de toggle/maximize/restore fechem todo o conteúdo e revelem um composer independente por baixo. Nas threads tradicionais, `restore-chat` continua funcionando; nas vinculadas, remover/desabilitar essa ação e manter o workspace central. Preservar layout responsivo de sheet em viewport estreito.
5. Fazer o filtro de abas protegidas valer tanto no renderer/context menu como nos handlers que chamam `cleanupRightPanelSurfaces`. `close others`, `close to right`, `close all`, atalhos de fechamento e saída do processo jamais enviam `terminal.close(deleteHistory: true)` para o ID principal.
6. Separar `onSessionExited` de fechamento no componente de terminal quando ele representa a principal. Mostrar estado encerrado sem remover surface; não mudar automaticamente o comportamento de todos os terminais legados.
7. Revisar `useAttachedTerminalSession` e o caminho `terminal.attach`: reanexar a PTY viva é permitido; se ela não existir/estiver encerrada, apenas montar o renderer não pode criar shell nem iniciar CLI. O servidor hoje pode abrir uma sessão ausente no attach; acrescentar, se necessário, opção compatível de attach somente existente e usá-la para o principal. `restartIfNotRunning: false` sozinho não deve ser presumido suficiente para sessão ausente.
8. Estado “não iniciado/encerrado” deve oferecer `Start terminal`/`Restart terminal` explícito usando o mesmo vínculo e o diretório final atual do servidor. Troca de abas ou reconexão não chama essa ação. Preservar histórico disponível sem prometer restauração de uma conversa que morreu com o backend.
9. Fechamento explícito/restart de recurso vivo usa os mecanismos existentes de confirmação. Excluir a thread conserva o cleanup existente. Não deixar PTYs órfãos ao excluir a sessão e não excluir worktrees ao fechar uma aba.
10. Abertura de arquivos pelo explorador e links de arquivo usa as surfaces centrais existentes. Preservar deduplicação por caminho e estado do editor. Não introduzir um segundo editor nem docking framework.

**Testes obrigatórios:** pressionar toggle duas vezes e invocar palette foca o mesmo ID; zero chamadas de alocação/close/restart; abrir arquivo/diff mantém PID e layout; close-other/all preserva principal mesmo quando arquivo é ativo; limpeza de localStorage reconstrói a aba com o mesmo ID; isolamento por environment; PTY exit mantém aba; attach ausente não faz spawn; reload/reconnect de PTY viva não faz launch; encerramento do backend deixa estado recuperável; exclusão da thread encerra os recursos esperados; threads tradicionais ainda abrem drawer e fazem split.

**Verificar:** W1, W2, S1/S2 para attach/restart, R1 e T2/T3/T4. Nesta fase, executar a parte já criada de W3 com `vp test run --project unit src/lib/terminalWorkspaceActions.test.ts`, a partir de `apps/web`; W3 completo fica para a fase 5. Testar handlers de efeito, não apenas a forma do array de surfaces. Reutilizar snapshots/controladores dos testes existentes para evitar testes acoplados à árvore inteira de ChatView.

### Fase 5 — Adicionar o controle “Terminal / Chat — Coming soon”

1. Criar componente pequeno `components/chat/WorkspaceModeControl.tsx`, usando os controles/tokens existentes. Colocá-lo no cabeçalho da **aba principal**, ou em uma toolbar de workspace claramente separada da seleção de arquivos. `Terminal` é ativo; `Chat` é desabilitado. Abrir um arquivo não deve parecer ter mudado a execução para Chat.
2. Manter o idioma atual da interface: label `Chat`, indicação visível `Coming soon` e descrição `View this terminal session as a conversation. Coming in a future update.` A documentação para o usuário pode explicar a intenção. Não colocar nomes de adapters/schemas na UI.
3. Usar atributo `disabled` real. Tooltip em wrapper alcançável por hover/foco e texto acessível associado, seguindo `PanelLayoutControls` para wrappers de botões desabilitados. Não depender exclusivamente de tooltip, pois botão desabilitado não recebe foco normalmente. Não animar continuamente o estado indisponível.
4. Clique, Enter, Space e event bus não podem habilitar Chat nem iniciar `thread.turn.start`. Não registrar atalho futuro com efeito e não persistir `view: chat` para essas sessões.
5. Remover do contexto terminal-first controles que sugerem restauração do chat independente. O botão desabilitado não pode coexistir com outra ação funcional que faça parecer que a mesma conversa já está disponível em chat.
6. Em mobile, `threadContentPresentation`/`ThreadDetailScreen` devem mostrar que aquela sessão usa terminal e requer web/desktop, sem composer enviável. Novas threads mobile continuam usando o fallback de criação tradicional já existente; não reescrever preferências globais. Threads tradicionais mantêm seu composer.

**Testes obrigatórios:** renderização do estado selecionado Terminal, botão Chat com disabled, indicação visível e descrição acessível; intenção de Chat não chama RPC/launch; ações de restore indisponíveis só em threads vinculadas; sheet responsivo preserva estado; apresentação mobile bloqueia composer apenas para terminalWorkspace. Testes de markup são adequados para o placeholder; política de ações deve ser testada separadamente.

**Verificar:** W2, W3, M1, T4/T5 e lint dos componentes novos. Não instalar framework de browser testing só para este botão.

### Fase 6 — Integrar, documentar e entregar evidências

1. Atualizar documentação interna com os fluxos corrigidos, vínculo durável, estados de lançamento, identidade por environment, limites de restart, e a extensão futura de conversa nativa da seção 4.3.
2. Atualizar documentação de usuário: aba principal fixa, arquivos no centro, atalhos de foco, recuperação de terminal encerrado, Chat em breve, preservação do chat tradicional e limites no mobile. Remover a instrução antiga de usar `Restore Chat and panel split` para acessar a conversa do CLI.
3. Executar os comandos focados correspondentes aos arquivos alterados. Após a integração, rodar W1/W2/W3/C1/R1/S1/S2/S3/M1 e typechecks aplicáveis uma vez; não repetir suites aprovadas sem novas mudanças ou falhas. L1 e D1 encerram a validação estática.
4. Comparar o diff com a base correta e o status inicial. Não incluir alterações de Kimi, planos anteriores ou workflow de build. Entregar lista de arquivos, comportamento final, testes e limitações.
5. Se uma inspeção de interface real tiver sido autorizada para a execução, usar uma instância isolada com repositório/estado de teste. Não iniciar o servidor contra `~/.t3/userdata`, não executar comandos de escrita em projetos pessoais e não matar processos encontrados por padrão. Se não houver essa autorização, registrar que a validação visual integrada está pendente, sem afirmar que ela ocorreu.

Roteiro para a inspeção integrada, quando realizada:

- Criar sessão local de shell e sessão com novo worktree; verificar diretório mostrado e diretório efetivo do shell.
- Abrir CLI de teste controlado; alternar sessões, arquivos e diff; conferir que não houve outro spawn/comando.
- Acionar `Cmd+J` e palette a partir de arquivo ativo; foco volta à principal.
- Fechar outras/todas as abas; terminal permanece. Encerrar shell; aba permanece com recuperação explícita.
- Simular falha de executável e repetir retry; nenhum comando duplicado no prompt.
- Recarregar cliente com backend vivo e depois reiniciar apenas o backend de teste; distinguir reattach de processo novo.
- Verificar o botão Chat desabilitado e a mensagem em viewport estreito; conferir uma thread tradicional como controle de regressão.

**Verificar:** comandos acima com exit 0, inspeção de `git diff --stat` e `git diff --check`; registrar separadamente testes automatizados e inspeção integrada efetivamente executados.

## 7. Critérios de conclusão

- [x] Baseline e revisão efetiva de implementação registradas; nenhum trabalho de `personal` sobrescrito.
- [x] Regressão worktree coberta: nenhum terminal antes da projeção aceita, um terminal no diretório final depois dela.
- [x] Lançamento repetido/concorrente no mesmo PTY resulta em uma única escrita; resultado incerto não é retransmitido.
- [x] Retry com env/cwd atualizado não encerra PTY viva implicitamente.
- [x] Vínculo terminalWorkspace sobrevive a snapshot, replay, restart do servidor e atualizações de metadata; eventos antigos continuam decodificando.
- [x] Capability ausente não produz falso sucesso de uma sessão vinculada.
- [x] Todos os controles de abertura/foco da sessão vinculada usam mainTerminalId e não criam drawer oculto.
- [x] Fechar abas e sair do processo não encerram/apagam a principal; exclusão explícita de thread conserva cleanup.
- [x] Reattach é distinto de abrir/reiniciar; render/reload/reconnect nunca relançam CLI automaticamente.
- [x] Nova sessão terminal-first oferece uma principal, sem criação/split de auxiliares pelo workspace; terminais internos e legados preservados.
- [x] Arquivos e diffs abrem no centro e não reiniciam terminal ao trocar de aba.
- [x] Chat aparece desabilitado com explicação visível/acessível e zero efeitos de execução.
- [x] Thread terminal não inicia provider estruturado por caminhos alternativos; threads tradicionais continuam funcionando.
- [x] Compatibilidade mobile coberta sem terminal nativo novo.
- [x] W1/W2/W3/C1/R1/S1/S2/S3/M1 e typechecks aplicáveis passam; comandos e resultados registrados.
- [x] L1 e D1 passam; diff dentro do escopo; documentação atualizada.
- [x] Validação integrada relatada com honestidade: executada e evidenciada, ou pendente com motivo.
- [x] Estado deste plano e linha 003 no índice local atualizados com o que foi efetivamente entregue.

## 8. Condições para interromper uma parte e relatar

Continuar o trabalho independente enquanto resolve uma limitação. Não pedir confirmação para decisões rotineiras já previstas aqui. Interromper a parte afetada e explicar evidências se:

- O código alvo já substituiu o bootstrap/PTy/event sourcing e as premissas deste plano não se aplicam; não portar cegamente trechos da revisão antiga.
- A sequência da confirmação não for comparável ao snapshot de shell no código efetivo. Nesse caso, propor retorno autoritativo de contexto final ou receipt específico antes de implementar espera que pode nunca terminar.
- A correção aparentemente exigir alterar dados de usuário em produção, credenciais globais, drivers/protocolos externos ou a semântica de threads tradicionais fora do escopo.
- Não houver informação suficiente para classificar uma thread antiga como terminal: preservar dados, não adivinhar. A conversão explícita restrita descrita acima é a solução padrão.
- Testes existentes já falharem na baseline por ambiente/dependências incompatíveis. Separar isso de regressões próprias; não “corrigir” com upgrades amplos ou desabilitando testes.
- Um problema de escrita no PTY só puder ser contornado reenviando comando com resultado incerto. Manter shell/erro recuperável e exigir reinício explícito, sem improvisar retransmissão.

## 9. Notas de manutenção e itens deliberadamente adiados

- `terminalWorkspace` descreve a sessão; `panelFirstByThreadKey` descreve apresentação. Não tornar um substituto do outro em refactors futuros.
- `startup` descreve intenção; `agentLaunch` descreve resultado de submissão; estado do PTY descreve shell; identidade nativa futura descreve conversa. São fatos diferentes.
- O próximo trabalho de Chat deve verificar capacidades de cada CLI e descobrir identidade nativa de forma confiável antes de consumir transcript. Não precisa existir agora um plugin system para isso.
- A guarda de lançamento deve permanecer no servidor mesmo com deduplicação do frontend, pois vários clientes podem controlar um environment.
- Não implementar indicadores de “agente pensando” ou contagem de mensagens a partir da label do terminal. A branch não tem eventos estruturados dessa execução.
- Persistência do vínculo não preserva processos através da morte do backend. Multiplexação/supervisão externa e retomada automática de conversas são projetos separados.
- A revisão descartou a hipótese de que o attach normal já mata o CLI por env diferente: PTY viva é preservada no caminho atual de attach. Não introduzir uma correção desnecessária nesse comportamento; o ajuste necessário é distinguir attach de criação quando não há PTY.
- Não ampliar o plano para Kimi, hooks do Orca ou workflow de build. O resultado é uma evolução do fork T3 que já existe, com o mínimo de estrutura durável necessário ao fluxo escolhido.

## 10. Registro de execução

Execução concluída em 2026-09-06.

- **Checkout/branch:** `/private/tmp/t3code-terminal-first-workspace`, `feature/terminal-first-workspace`, com tracking de `origin/feature/terminal-first-workspace`.
- **Base efetiva:** `30c0c7cadb824a959c553b9b25834be4b41aa7bc`, exatamente a revisão planejada. Entrega em diff local, sem commit, push ou PR.
- **Preservação:** checkout original permanece em `personal` (`b4e964b9d`), com as alterações preexistentes em `ProviderSettingsForm.test.ts` e `providerDriverMeta.ts` intactas. Apenas este plano e o índice local foram atualizados ali. Nenhuma mudança de Kimi, workflow ou lockfile foi incluída.
- **Baseline:** 81 testes web, 110 testes de Manager/projeções e 71 testes de contratos aprovados antes da implementação. Dependências instaladas no worktree com `vp i --frozen-lockfile`.

### Entrega por fase

1. Coordenador aguarda a sequência aceita no snapshot do mesmo environment antes de derivar o input. Espera limpa listeners, suporta cancelamento/erros e retry sem rematerialização. Regressão controla projeções inicial/final e comprova zero aberturas antes do worktree final.
2. `openAgent` compõe abertura, preflight e submissão sob lock por thread. Guarda por geração impede retransmissão, inclusive após escrita incerta; retry preserva PTY existente apesar de mudança de contexto. Restart explícito permite nova geração. Testes usam PTY fake e Deferred.
3. Binding durável propagado por contratos, bootstrap, eventos, replay, SQL e snapshots completos/shell/paginados. Migração 045 aditiva cobre upgrade e repetição. Capability opcional, conversão explícita de threads elegíveis e guarda de `thread.turn.start` implementadas.
4. Principal fixa reconstruída a partir do binding; foco e fechamento de abas protegem o processo. Attach principal carrega somente processo/histórico existente; recuperação usa restart explícito. Renderers consultam shell mesmo antes do detalhe. Conversão preserva recursos legados, inclusive identidade do restante de um split.
5. Controle Terminal/Chat com Chat realmente desabilitado e explicação acessível. Composer e intenções de restore são bloqueados para sessões vinculadas. Mobile informa necessidade de web/desktop e não oferece composer enviável.
6. Documentação interna e de usuário atualizada, revisão independente concluída, testes focados e checagens estáticas aprovados. Plano e índice locais atualizados.

### Comandos executados e resultados

Os caminhos e comandos completos de cada ID estão na seção 5. Grupos combinados usaram a união exata dos arquivos listados, no diretório indicado, sem suites globais.

| Verificação final | Resultado                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| W1 + W2 + W3      | 9 arquivos, 101 testes aprovados; repetidos após correções finais de UI                                              |
| C1                | 3 arquivos, 73 testes aprovados                                                                                      |
| R1                | 4 arquivos, 47 testes aprovados                                                                                      |
| S1 + S3           | 6 arquivos, 118 testes aprovados                                                                                     |
| S2                | 16 testes aprovados, 118 fora do filtro                                                                              |
| M1                | 5 testes aprovados                                                                                                   |
| T1 + T2           | `vp run --filter @t3tools/contracts --filter @t3tools/client-runtime typecheck`, exit 0                              |
| T3                | `vp run --filter t3 typecheck`, exit 0                                                                               |
| T4 + T5           | `vp run --filter @t3tools/web --filter @t3tools/mobile typecheck`, exit 0; T4 repetido após correções finais, exit 0 |
| L1                | Lint focado dos arquivos TS/TSX modificados e novos, exit 0                                                          |
| D1                | `git diff --check`, exit 0                                                                                           |

Total final: **360 testes focados aprovados**, sem incluir execuções repetidas nem os testes adicionais executados pela revisão independente.

### Revisão independente e ajustes

`codex review --uncommitted` executado no worktree, após autorização explícita do usuário para enviar o diff ao serviço configurado. A revisão terminou com um achado P2: o toast de retry capturava a política da primeira falha, mantendo “Try again” disponível após um resultado posterior exigir restart. Corrigido passando o resultado mais recente a cada recriação do toast. Nenhum achado foi descartado. O revisor também executou 87 testes focados e o typecheck web, ambos aprovados. Registro da revisão: `/private/tmp/t3-terminal-review.log`.

A inspeção local adicional ajustou o fallback ao shell nos renderers durante carregamento do detalhe, a leitura atualizada do modo principal em links do terminal e a identidade de recurso ao extrair o principal de um split legado. W1/W2/W3, T4, L1 e D1 passaram após esses ajustes.

### Limitações e decisões de escopo

- **Validação visual integrada pendente.** Não houve autorização para abrir browser/computer use; nenhum teste visual real, sessão autenticada de CLI ou reinício integrado de backend foi realizado. Persistência/replay, attach sem spawn e recuperação foram verificados nos testes automatizados com banco e PTY de teste. O roteiro integrado da seção 6 permanece disponível.
- O primeiro S2 no sandbox falhou por `listen EPERM`; a repetição autorizada com permissão de bind passou. A instalação de dependências também exigiu rede autorizada. Não há falha de baseline pendente.
- A revisão independente foi inicialmente bloqueada pelo sandbox e pela revisão automática de envio externo; foi executada após autorização explícita do usuário. Avisos de inicialização do MCP Linear não impediram a revisão.
- Typecheck de servidor reportou sugestões Effect preexistentes, sem erros. Nenhum dado de `~/.t3/userdata` foi acessado ou usado como fixture; nenhum servidor de desenvolvimento ou CLI real de provider foi iniciado para validação.
- Arquivos consumidores diretos adicionais ao inventário principal: `ThreadRouteScreen.tsx` propaga a apresentação mobile; `CommandPalette.tsx` bloqueia restore; `threadDetail.ts` preserva metadata recente do shell; `ProjectSetupScriptRunner.test.ts` atualiza o mock do serviço. São ajustes necessários ao contrato e comportamento entregues, sem expansão de produto.
- Chat nativo do CLI, descoberta de conversa, readiness/autenticação e terminal nativo mobile continuam deliberadamente adiados.
