# KL Beauty CRM 1.1 — instalação no Render

Este pacote é uma versão autônoma do KL Beauty, preparada para Node.js + PostgreSQL. Não depende de login do ChatGPT, Cloudflare Workers ou D1. O site original não foi modificado.

## 1. Conteúdo do pacote

- `src/`: interface completa do CRM e login próprio.
- `lib/`: regras de agenda, caixa, estoque, pacotes e comissões.
- `server/`: API, autenticação, sessões e esquema PostgreSQL.
- `scripts/reset-password.mjs`: recuperação de senha administrativa.
- `tests/`: testes do domínio, API HTTP, permissões e banco.
- `dist/`: frontend compilado para referência; o Render gera novamente no build.
- `package.json` e `package-lock.json`: dependências e comandos.
- `.env.example`: modelo de configuração, sem segredos.
- `Dockerfile`: alternativa para execução em Docker.

Nenhum dado real, senha, token, credencial de hospedagem ou configuração do site privado foi incluído. A instalação nova começa vazia. Exportações do site anterior não são importadas automaticamente.

## 2. Enviar ao GitHub

Crie um repositório NOVO e preferencialmente privado chamado `kl-beauty-render`. Não substitua o repositório do EsteticaPro nem o do KLSistemas.

### Opção A — pelo navegador

1. Extraia o ZIP.
2. Entre na pasta `KL_Beauty_Render`.
3. No novo repositório GitHub: **Add file → Upload files**.
4. Envie o CONTEÚDO da pasta, mantendo `package.json` na raiz do repositório.
5. Inclua as pastas `src`, `lib`, `server`, `scripts`, `tests`, `public` e os arquivos de configuração.
6. Não envie `.env`, `node_modules` nem senhas. O arquivo `.env.example` pode ser enviado.
7. Confirme o commit. Se não conseguir incluir `.node-version` pela interface, configure `NODE_VERSION=24` no Render.

### Opção B — comandos no Windows PowerShell

Instale Git e Node.js 24 antes. Abra o PowerShell na pasta onde salvou o ZIP. Não digite senhas diretamente em comandos.

```powershell
Expand-Archive -Path .\KL_Beauty_Render_v1.1.zip -DestinationPath .
cd .\KL_Beauty_Render
git init
git branch -M main
git add .
git commit -m "KL Beauty CRM 1.1 para Render"
git remote add origin https://github.com/SEU_USUARIO/kl-beauty-render.git
git push -u origin main
```

Substitua `SEU_USUARIO` pelo seu usuário GitHub. O repositório remoto deve existir e estar vazio, sem README criado pelo GitHub. Se o Git pedir identidade, execute uma vez com seus dados:

```powershell
git config --global user.name "SEU NOME"
git config --global user.email "SEU EMAIL"
```

Depois repita o commit/push que falhou. Autentique-se no GitHub quando solicitado pelo Git Credential Manager; não coloque token na URL do repositório.

### Opção C — Linux / macOS

```bash
unzip KL_Beauty_Render_v1.1.zip
cd KL_Beauty_Render
git init
git branch -M main
git add .
git commit -m "KL Beauty CRM 1.1 para Render"
git remote add origin https://github.com/SEU_USUARIO/kl-beauty-render.git
git push -u origin main
```

## 3. Criar o PostgreSQL

Abra https://dashboard.render.com/new/database

1. Nome: `kl-beauty-db`.
2. Escolha uma região e use A MESMA região no Web Service.
3. Crie um banco dedicado a este CRM. Não reutilize o banco dos outros sistemas.
4. Escolha o plano de banco após revisar o preço apresentado pelo Render.
5. Copie a **Internal Database URL** em Connections. Esse endereço é um segredo.

O PostgreSQL gratuito do Render expira em 30 dias e não tem backups gerenciados. Serve para teste temporário. Para dados reais, use banco persistente pago ou outro PostgreSQL com retenção e backup adequados.

Também é possível usar PostgreSQL externo. Nesse caso utilize o endereço fornecido pelo provedor e `DATABASE_SSL=verify`. O certificado será validado. Se o provedor exigir certificado CA específico, configure `NODE_EXTRA_CA_CERTS` com o arquivo disponibilizado pelo provedor; não desative validação para contornar erro de certificado.

## 4. Criar o Web Service

Abra https://dashboard.render.com e clique **New → Web Service**. Conecte o novo repositório.

| Campo | Valor |
|---|---|
| Name | `kl-beauty-render` ou outro nome disponível |
| Language / Runtime | `Node` |
| Branch | `main` |
| Region | A mesma do PostgreSQL |
| Root Directory | Deixe vazio se `package.json` estiver na raiz |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/healthz` |

O nome do serviço não garante que a URL seja exatamente `kl-beauty-render.onrender.com`; copie a URL REAL exibida pelo Render.

A aplicação escuta em `0.0.0.0` e usa a variável `PORT` fornecida pelo Render. Não precisa criar disco persistente, pois os registros ficam no PostgreSQL.

## 5. Variáveis de ambiente

Em **Environment → Add Environment Variable**, preencha:

| Chave | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24` (opcional se `.node-version` foi enviado) |
| `DATABASE_URL` | A Internal Database URL do PostgreSQL |
| `DATABASE_SSL` | `disable` para a URL interna do Render; `verify` para conexão externa com TLS |
| `ADMIN_EMAIL` | Seu e-mail real para o primeiro administrador |
| `ADMIN_PASSWORD` | Senha exclusiva, de 12 a 200 caracteres |
| `APP_URL` | A URL HTTPS real do Web Service, sem barra final |

Exemplo de APP_URL: `https://nome-real-do-seu-servico.onrender.com`. Esse exemplo deve ser substituído pela URL exibida no seu painel.

`DATABASE_URL` e `ADMIN_PASSWORD` são segredos: digite no painel, nunca no GitHub. Não há senha padrão compartilhada. Não é necessário `SESSION_SECRET`: os tokens são aleatórios e armazenados somente por hash no banco.

Se a URL só aparecer após criar o serviço, salve `APP_URL` com a URL correta e execute **Manual Deploy → Deploy latest commit**. O servidor recusa iniciar em produção sem uma APP_URL HTTPS válida.

O administrador é criado automaticamente APENAS quando ainda não existe administrador no banco. Reiniciar não muda sua senha. Após confirmar o primeiro acesso, remova `ADMIN_PASSWORD` do ambiente do Render para reduzir a exposição dessa senha; o próximo início utilizará a conta já persistida. Não remova DATABASE_URL.

## 6. Primeiro acesso

1. Aguarde o status **Live**.
2. Abra `https://SUA-URL/healthz`. Deve retornar `{"status":"ok","version":"1.1.0"}`.
3. Abra a página inicial e entre com o `ADMIN_EMAIL` e a senha definidos.
4. Clique **Criar meu salão**. Desmarque dados fictícios para começar vazio.
5. Cadastre profissionais, produtos, serviços e clientes.
6. Faça um agendamento de teste, marque chegada, inicie e conclua.
7. Confira o recebível, a comissão e a baixa de estoque; registre o pagamento.
8. Atualize a página e confirme a persistência. Depois de um reinício manual do serviço, confira novamente.

## 7. Acesso da equipe

1. Administrador: no topo, **Contas de acesso → Criar conta**.
2. Informe o e-mail e uma senha inicial exclusiva com pelo menos 12 caracteres.
3. Dentro do salão: **Configurações → Adicionar permissão por e-mail**.
4. Escolha Recepção ou Gestão financeira.
5. Envie a URL e as credenciais ao funcionário por canal privado. Nenhum e-mail automático é enviado.
6. O funcionário entra e pode alterar a senha em **Minha senha**.
7. **Desativar conta** encerra as sessões existentes. Remover a permissão do salão remove o acesso aos dados daquela empresa.

O administrador da instalação pode criar salões. Usuários da equipe não podem criar empresas ou outras contas. Um usuário pode ser associado a mais de um salão.

## 8. Comandos de verificação local

Node.js 24 e npm são necessários:

```bash
node --version
npm --version
npm ci --include=dev
npm run build
npm test
```

Para rodar localmente, faça uma cópia de `.env.example` como `.env` e EDITE com seu PostgreSQL:

PowerShell:
```powershell
Copy-Item .env.example .env
notepad .env
npm start
```

Linux/macOS:
```bash
cp .env.example .env
nano .env
npm start
```

No arquivo local, mantenha `NODE_ENV=development`, `PORT=10000`, `APP_URL=http://localhost:10000`. Use a URL EXTERNA do PostgreSQL para acesso fora do Render e `DATABASE_SSL=verify`. Abra http://localhost:10000 . Para PostgreSQL local sem TLS, use `DATABASE_SSL=disable`.

Para desenvolver a interface com recarga automática, em outro terminal execute `npm run dev`, use a URL mostrada pelo Vite e ajuste APP_URL para essa origem durante o desenvolvimento. Reinicie o servidor após alterar `.env`.

## 9. Atualizações

Na pasta do projeto, depois de alterar arquivos:

```bash
npm ci --include=dev
npm run build
npm test
git add .
git commit -m "Atualiza KL Beauty"
git push origin main
```

Com deploy automático habilitado no Render, o push inicia o novo deploy. Caso contrário: **Manual Deploy → Deploy latest commit**. Não recrie nem apague o PostgreSQL para atualizar o sistema.

## 10. Backup e recuperação de senha

- No sistema: Configurações → Exportar dados, um JSON por salão. A restauração JSON ainda exige suporte; não trate exportação como restauração automática.
- Para cópia completa do banco, use backups do seu provedor ou `pg_dump`/`pg_restore` de uma versão compatível com o servidor PostgreSQL.
- O arquivo completo de banco inclui contas e sessões. Proteja-o como dado confidencial.

Exemplo para Bash com cliente PostgreSQL instalado (URL fornecida de forma oculta, sem gravá-la no histórico):

```bash
read -r -s -p "URL externa do PostgreSQL: " PGDATABASE
printf '\n'
export PGDATABASE
export PGSSLMODE=require
mkdir -p backups
pg_dump --format=custom --file="backups/kl-beauty.dump"
unset PGDATABASE PGSSLMODE
```

O backup acima usa TLS; siga a política do provedor para validação de CA com `verify-full` se aplicável. Guarde várias cópias datadas; o exemplo sobrescreve `kl-beauty.dump` na próxima execução. Restaure primeiro em um banco NOVO de teste, não sobre o banco em operação. Exemplo com a URL do banco de teste carregada em PGDATABASE:

```bash
pg_restore --dbname="$PGDATABASE" --no-owner --no-acl backups/kl-beauty.dump
```

Para recuperar senha esquecida: no computador com os arquivos e Node 24, edite o `.env` LOCAL, use DATABASE_URL externa + DATABASE_SSL=verify e acrescente temporariamente:

```dotenv
RESET_EMAIL=email-da-conta@exemplo.com
RESET_PASSWORD=SUA_NOVA_SENHA_EXCLUSIVA_DE_PELO_MENOS_12_CARACTERES
```

Execute:

```bash
npm run reset-password
```

Remova as duas variáveis RESET do `.env` após o sucesso. Sessões anteriores dessa conta são encerradas. Alterar ADMIN_PASSWORD no Render depois da criação da conta NÃO redefine a senha.

## 11. Docker opcional

A instalação nativa Node no Render é o caminho principal. Para Docker:

```bash
docker build -t kl-beauty:1.1 .
docker run --rm -p 10000:10000 --env-file .env kl-beauty:1.1
```

Para teste local HTTP, `.env` precisa definir NODE_ENV=development e APP_URL=http://localhost:10000. Em produção, use HTTPS e NODE_ENV=production. O banco deve ser acessível a partir do contêiner; `localhost` dentro dele aponta para o próprio contêiner.

## 12. Erros comuns

| Erro | Correção |
|---|---|
| `package.json` não encontrado | Arquivos estão numa subpasta; mova o conteúdo para a raiz ou informe Root Directory corretamente. |
| `vite: not found` | Build precisa ser `npm ci --include=dev && npm run build`. |
| `Configure DATABASE_URL` | Adicione a conexão do banco em Environment. |
| Conexão recusada / timeout do banco | Confira URL, região, disponibilidade, firewall e se usou URL interna somente dentro do Render. |
| Erro de certificado | Use a URL/configuração TLS correta do provedor; não utilize conexão externa sem validação para esconder o erro. |
| `Origem não autorizada` | APP_URL deve coincidir com a origem usada no navegador, incluindo https e eventual domínio próprio. |
| Login não mantém sessão | Produção exige HTTPS para o cookie Secure. Não abra a URL em HTTP. |
| Senha do ambiente não funciona após alterar | A conta já existe; use Minha senha ou reset-password. |
| Dados desapareceram ao trocar de URL | O site anterior e esta instalação usam bancos diferentes. Não há migração automática. |
| Primeira abertura lenta | Web Service Free pode estar suspenso por inatividade. Não é perda do banco. |

## 13. Limites e verificação

O servidor grava o agregado do salão em JSONB com controle de versão. Mudanças concorrentes conflitantes retornam 409, evitando sobrescrita silenciosa. As tabelas de contas/sessões são próprias e os dados de cada salão são autorizados no servidor. Hash de senha com scrypt, cookies HttpOnly/Secure em produção, proteção de origem e limite de tentativas de login.

Mantidos os limites funcionais da v1: sem emissão fiscal, Pix/cartão integrados, envio automático de WhatsApp, agenda pública, venda avulsa de produtos ou importação automática. Limite de aproximadamente 1,5 milhão de caracteres de dados por salão. Para grande escala, a arquitetura precisa ser normalizada e paginada.

Build e testes automatizados executados no ambiente de criação. Os testes SQL/HTTP usam o motor PostgreSQL embarcado PGlite. Isso não substitui validação de TLS, conectividade e deploy real no Render. Nenhum serviço ou banco foi criado na sua conta nesta entrega. O Dockerfile foi incluído, mas a imagem não foi executada neste ambiente. A interface não passou por teste visual automatizado de navegador.

## Referências oficiais consultadas

- https://render.com/docs/deploy-node-express-app
- https://render.com/docs/free
- https://render.com/docs/postgresql-creating-connecting

Consulte o painel para os preços e recursos atuais antes de contratar. O Web Service gratuito pode suspender após 15 minutos sem tráfego e as horas gratuitas são compartilhadas no workspace. O PostgreSQL Free expira após 30 dias. Não dependa desses planos para uma operação comercial contínua.
