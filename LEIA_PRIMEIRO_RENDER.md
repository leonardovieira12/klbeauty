# Dois sistemas, um endereço

Léo, pense neste pacote como uma casa com duas salas. A porta principal mostra dois botões. Um abre o salão; o outro abre o mercado.

- Porta principal: `https://SEU-NOME.onrender.com/`
- KL Beauty: `https://SEU-NOME.onrender.com/beauty/`
- KLSistemas: `https://SEU-NOME.onrender.com/mercado/`

Você terá **um Web Service** no Render. O PostgreSQL é um recurso separado que guarda os dados dos dois sistemas. Portanto, um endereço e um serviço de aplicação não significam apenas um recurso no painel.

## 1. Abra a caixa

Baixe e extraia o ZIP. Abra a pasta `KL_Portal_Render`. Você precisa enxergar o arquivo `Dockerfile` e as pastas `beauty` e `mercado` juntos.

Esta entrega usa KL Beauty Render 1.1 e o arquivo KLSistemas 2.2.0 Multiempresa encontrado anteriormente. Não modifica os serviços que você já tem. Não copia automaticamente os clientes, vendas, senhas ou agendamentos de instalações anteriores.

## 2. Coloque a pasta no GitHub

Crie um repositório **novo e privado**, chamado `kl-portal`. Não marque a opção de criar README no GitHub. Dentro dele, envie o conteúdo da pasta extraída: o `Dockerfile` deve aparecer logo na primeira tela do repositório, e não dentro de outra pasta.

Se preferir usar comandos, instale Git, abra o terminal dentro da pasta `KL_Portal_Render` e execute um comando por vez. Troque SEU-USUARIO pelo seu usuário GitHub:

```bash
git init
git add .
git commit -m "Adicionar portal KL Beauty e KLSistemas"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/kl-portal.git
git push -u origin main
```

O GitHub poderá pedir autenticação. Nunca envie senhas reais, arquivo `.env` ou a conexão do banco para o repositório. O `.env.example` contém somente nomes e exemplos.

## 3. Prepare o banco — o caderno que guarda tudo

No [painel do Render](https://dashboard.render.com), escolha **New → Postgres**. Para uma instalação de teste, crie um banco vazio chamado `kl-portal-db`. Anote a região escolhida. Espere ficar disponível e copie o campo **Internal Database URL**. Guarde esse endereço como uma senha.

O Render permite somente um Postgres gratuito ativo por workspace. Se você já tem um, não apague o banco atual para criar este. Pode ser necessário outro banco pago ou planejar o uso do existente com backup e verificação de compatibilidade.

## 4. Crie a casa dos dois sistemas

No Render, clique **New → Web Service**, conecte o GitHub e selecione o repositório `kl-portal`.

| Campo | O que colocar |
|---|---|
| Name | `kl-portal` ou outro nome disponível |
| Region | A mesma região do banco |
| Branch | `main` |
| Language / Runtime | **Docker** |
| Root Directory | Deixe vazio |
| Dockerfile Path | `./Dockerfile` |
| Docker Command | Deixe no padrão, vazio |
| Instance Type | Free para testar |
| Health Check Path | `/healthz` |

O Dockerfile já contém os comandos de instalação, compilação e inicialização. Você não precisa escolher Node ou Go nem preencher comandos separados de Build e Start. Se esses campos estiverem aparecendo como obrigatórios, confira se selecionou Docker.

## 5. Preencha as etiquetas de configuração

Na seção **Environment**, clique em adicionar variável e crie estas seis linhas:

| Nome da variável | Valor que você deve colocar |
|---|---|
| `DATABASE_URL` | Internal Database URL copiada do banco |
| `DATABASE_SSL` | `disable` — somente para essa conexão interna do Render |
| `ADMIN_EMAIL` | Seu e-mail para entrar no KL Beauty |
| `ADMIN_PASSWORD` | Uma senha exclusiva com pelo menos 12 caracteres |
| `KLS_ADMIN_USER` | `admin` ou seu usuário preferido para o mercado |
| `KLS_ADMIN_PASSWORD` | Outra senha exclusiva com pelo menos 12 caracteres |

Não copie senhas de exemplos. Guarde suas duas senhas. Essas variáveis criam os administradores iniciais quando o banco ainda está vazio; mudar a variável depois não redefine automaticamente uma senha existente.

Não precisa preencher `APP_URL`: o pacote usa automaticamente o endereço fornecido pelo Render. Para domínio próprio, configure `APP_URL` com a origem completa, como `https://sistemas.suaempresa.com`, sem `/beauty` ou `/mercado`. Apenas a origem configurada será aceita para navegar.

Clique **Deploy Web Service**. Aguarde a compilação. Quando aparecer **Live**, abra o endereço mostrado no topo.

## 6. Entre em cada sala

Clique KL Beauty e use `ADMIN_EMAIL` + `ADMIN_PASSWORD`. Volte à página inicial e clique KLSistemas; use `KLS_ADMIN_USER` + `KLS_ADMIN_PASSWORD`.

Cada sistema tem seu próprio login. O cadastro público de empresas do KLSistemas original foi preservado. As tabelas do salão começam com `kl_`; as do mercado, com `kls_`. Eles compartilham a capacidade do serviço e, por padrão, o mesmo banco.

Antes de usar com clientes reais, faça um cadastro de teste, um agendamento no salão e uma venda de teste no mercado. Reinicie o serviço e confira se os registros continuam disponíveis. O mercado pode pedir novo login após reiniciar, pois suas sessões ficam em memória.

## Gratuito: o que realmente significa

Segundo a [documentação oficial do Render](https://render.com/docs/free), consultada em 20/10/2026:

- O serviço Free dorme após 15 minutos sem acesso e pode levar cerca de um minuto para acordar.
- O workspace compartilha 750 horas gratuitas por mês entre seus serviços gratuitos. Manter os serviços antigos funcionando também consome essa cota.
- O Postgres Free expira após 30 dias; não é armazenamento gratuito permanente.
- Há limites de memória, tráfego e compilação. Dois sistemas juntos compartilham os recursos. Não foi feito teste de carga deste pacote no Render.

Para operação comercial contínua, planeje serviço e banco com persistência, capacidade e backups adequados. Não salve o banco em arquivo local do serviço gratuito: esse arquivo se perde em reinicializações. Este pacote usa PostgreSQL para os dados dos aplicativos.

## Se já existem dados nos seus sistemas

Esta entrega não executou migração nem alterou sua conta Render. Primeiro teste com banco vazio. Para levar dados reais, faça backup, confirme qual versão está em produção e valide a restauração antes de trocar os links usados pelos funcionários. Não exclua serviços ou bancos antigos antes dessa conferência.

Opcional avançado: `KLS_DATABASE_URL` permite manter o mercado em outro PostgreSQL. Se não existir, ele usa `DATABASE_URL`. `DATABASE_SSL` vale para ambos; para conexão externa com certificado válido, use `verify`. Não combine bancos que exijam políticas TLS diferentes nesta versão.

A impressão direta por driver Windows do KLSistemas não funciona dentro do servidor Linux do Render. Use o fluxo de impressão disponível no navegador; valide sua impressora no computador do caixa.

## Se algo não abrir

- **Build failed:** abra Logs e veja o primeiro erro. Confirme que o Dockerfile está na raiz e que as duas pastas foram enviadas.
- **Falha de conexão com banco:** confira a URL interna, a região e se o banco está ativo.
- **Host inválido:** remova um `APP_URL` incorreto para usar o endereço automático, ou informe seu domínio HTTPS correto.
- **Senha rejeitada no início:** as duas senhas iniciais precisam ter pelo menos 12 caracteres.
- **Primeira visita lenta:** o Free pode estar acordando.
- **Health check falha:** `/healthz` exige que os dois componentes e a conexão do Beauty estejam funcionando; confira os Logs.

## Comandos de atualização

Depois de editar os arquivos localmente, dentro da pasta do projeto:

```bash
git add .
git commit -m "Atualizar portal KL"
git push
```

Com auto-deploy ativado, o Render recompila. Também é possível usar **Manual Deploy → Deploy latest commit**. Não apague o banco para atualizar a aplicação.

## Comandos técnicos opcionais

Para construir a imagem num computador com Docker:

```bash
docker build -t kl-portal .
```

Para iniciar a imagem, crie uma cópia de `.env.example` chamada `.env`, preencha as variáveis e configure uma origem HTTPS alcançável por proxy. O servidor exige HTTPS na origem e os cookies são seguros; abrir somente `http://localhost` não é um teste completo de login.

```bash
docker run --rm --env-file .env -p 10000:10000 kl-portal
```

Para executar os testes de código, com Node 24 e Go compatível com o go.mod instalados:

```bash
cd beauty
npm ci --include=dev
npm test
npm run build
cd ..
npm run test:gateway
cd mercado
go test ./...
cd ..
```

Veja `VALIDACAO.md` para o escopo dos testes e as limitações da entrega.
