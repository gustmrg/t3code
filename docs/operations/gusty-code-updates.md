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
somente depois da validação. O workflow desktop descrito abaixo publica somente por tag ou solicitação manual.

## Releases desktop pelo GitHub Actions

O workflow `Gusty Desktop Release` gera macOS Apple Silicon (`arm64`), macOS
Intel (`x64`) e Linux `x64`. Não inclui Windows nem distribuição mobile.
O workflow oficial `Release` fica restrito ao repositório upstream.

Usar uma sequência SemVer própria: por exemplo, começar em `0.1.0`, publicar
uma correção Gusty como `0.1.1` e continuar incrementando a versão mesmo quando
a base T3 não mudar. Antes da primeira publicação, conferir a versão dos builds
já instalados: a versão nova deve ser maior. Não usar `+gusty.N` para ordenar
atualizações, pois metadados não alteram precedência SemVer; `-gusty.N` é uma
pré-release. As notas registram a versão dos pacotes upstream e o commit exato
do fork. Registrar a tag/commit upstream integrado na descrição da integração.

Depois de integrar o workflow na `main`:

1. Em Actions → Gusty Desktop Release → Run workflow, escolher a referência
   validada e informar a versão. Deixar `publish` desmarcado para obter apenas
   artifacts de teste (retidos por 14 dias).
2. Testar os instaladores nas três plataformas. A validação local do YAML não
   substitui o primeiro build nos runners do GitHub.
3. Executar novamente com `publish` marcado, ou enviar uma tag `v0.1.0` no
   commit validado. Tags estáveis `v*.*.*` iniciam build e publicação.
4. Os três builds precisam terminar antes da publicação. O workflow combina os
   manifests macOS, cria um draft, envia os arquivos e só então torna a release
   pública. Não sobrescreve releases existentes. Se falhar após criar um draft,
   inspecionar e remover somente esse draft incompleto antes de tentar novamente.

Nunca publicar uma versão inferior à última release Gusty. Não reutilizar tags
upstream já presentes no fork. Uma tag existente só pode apontar para o mesmo
commit que está sendo construído. O workflow não faz merge, não altera a `main`
e não publica npm ou serviços na nuvem. O `GITHUB_TOKEN` recebe escrita apenas
no job de publicação; não é necessário PAT.

Durante o build, as versões de desktop, web, servidor e contratos são alinhadas
à versão Gusty no checkout temporário. Essas alterações não são commitadas.
Usar o servidor correspondente ao build Gusty para evitar divergência de versão
com servidores oficiais remotos.

Os builds macOS iniciais não são assinados nem notarizados. A instalação é manual
e pode exigir autorização nas configurações de segurança do macOS. A atualização
automática macOS exige configurar assinatura Apple antes de ser utilizada. Linux
recebe AppImage e seu manifest de atualização. O destino do atualizador é
explicitamente `gustmrg/t3code`.
