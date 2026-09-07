# Manutenção do Gusty Code

A `main` deste fork deve conter a versão validada do Gusty Code. O remoto
`upstream` aponta para `pingdotgg/t3code`; `origin` aponta para `gustmrg/t3code`.
O código oficial entra pelo Git. O atualizador do aplicativo instala builds
prontas e não resolve conflitos nem reaplica a personalização.

## Integrar uma atualização

1. Salvar o trabalho atual em commits separados por preocupação. Não misturar
   ajustes visuais com correções funcionais. Commits e publicação continuam
   dependendo de uma solicitação explícita do mantenedor.
2. Executar `git fetch upstream --tags` e escolher uma tag estável oficial.
3. Partindo da `main` do fork, criar uma branch `codex/sync-t3-<versao>` e fazer
   `git merge <tag-oficial>`. A `main` permanece utilizável durante a integração.
4. Resolver cada conflito preservando a lógica atualizada do upstream e
   reaplicando apenas a diferença visual necessária. Não usar uma preferência
   global por “ours”: ela pode descartar correções oficiais silenciosamente.
5. Executar os testes dos caminhos afetados e os typechecks dos respectivos
   pacotes. Verificar aparência, configurações e conexão em um cliente real
   quando autorizado. Merge limpo não garante compatibilidade funcional.
6. Integrar a branch validada na `main`, registrar a tag oficial de base e criar
   uma tag própria para o build do Gusty. Não reutilizar uma tag oficial para
   outro conteúdo.

Integrar versões em intervalos curtos reduz o tamanho de cada adaptação. Uma
atualização de segurança pode justificar antecipar a integração.

## Limites da personalização

- Nome compartilhado dos pontos de entrada: `packages/shared/src/branding.ts`.
- Paleta web/desktop: `packages/shared/src/gustyTheme.ts`. Seus tipos seguem os
  papéis de cor do motor original; um novo papel obrigatório exige escolher sua cor.
- Vetores e referência visual: `assets/gusty/`. Gerar assets com
  `vp run icons:export` e conferir com `vp run icons:check`.
- HTML inicial, metadados nativos, CSS mobile e textos editoriais ainda precisam
  de revisão por superfície; não são todos derivados da constante de nome.
- Manter protocolos, diretórios de dados e identificadores internos separados
  dos nomes visíveis. Preservar campos de configuração que ainda existem no upstream.
- A preferência `environmentIdentificationMode` aceita e preserva `artwork`,
  `pill` e `none`, com padrão `pill`. A sidebar Gusty continua mostrando a pill;
  preservar o contrato não reintroduz artwork nem seu seletor.
- Kimi não é mais um provider incluído. Os planos 001/002 foram retirados de uso.
  Não reintroduzir seu adapter, runtime ou opções ao resolver conflitos.

## Distribuir a versão personalizada

Para builds desktop destinados a atualização, definir explicitamente:

```sh
export T3CODE_DESKTOP_UPDATE_REPOSITORY=gustmrg/t3code
```

O empacotador existente usa essa variável para gerar a configuração do
atualizador. Ela tem prioridade sobre `GITHUB_REPOSITORY`. Conferir o
`app-update.yml` dentro do build antes de distribuí-lo: o destino deve ser o fork.
Não apontar builds Gusty para releases de `pingdotgg/t3code`.

Publicar instaladores e metadados de atualização correspondentes na mesma
release do fork, seguindo os requisitos de assinatura de cada plataforma.
Usar versões que o atualizador reconheça como posteriores à versão instalada
e manter o canal estável/nightly coerente. Registrar também a versão T3 de base;
uma tag própria não exige alterar independentemente a versão de cada pacote.

Definir o repositório não compila, assina nem publica uma release. O fluxo é:
release T3 → integração validada → build/release Gusty → atualização instalada.
Para web auto-hospedada, recompilar e implantar os assets do fork. Instalar o
pacote npm oficial pode voltar a servir a UI oficial. Manter cliente e servidor
compatíveis, inclusive em ambientes remotos. Mobile possui distribuição própria.

Uma automação futura pode preparar a branch e executar os testes. Publicar
somente depois da validação. Este documento não configura publicação automática.
