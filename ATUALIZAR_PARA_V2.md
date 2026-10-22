# KL Portal 2.3 — Superadmin, empresas e mensalidades

Este pacote atualiza o portal já publicado. Continua sendo um Web Service com KL Beauty, KLSistemas e agora uma administração central em `/admin/`. Não foi publicado automaticamente em sua conta.

## O que você poderá administrar

- Empresas de ambos os sistemas, com busca, filtros e exportação CSV.
- Cadastro da empresa e do primeiro administrador numa operação única.
- Nome, documento, contato, plano, valor mensal, próximo vencimento e tolerância.
- Suspensão, cancelamento, reativação e exclusão restaurável de cadastros sem apagar os dados.
- Criação, vínculo, desativação, reativação, perfil e redefinição de senha de usuários.
- Mensalidades recorrentes, recebimentos integrais ou parciais, estornos e cancelamento de mensalidades.
- Bloqueio por atraso e liberação após quitação, quando a política automática está ativa.
- Histórico de alterações, com responsável e motivo. Senhas não entram na auditoria.

O superadmin tem credencial própria. Administradores de salões e mercados não ganham acesso ao painel central.

## 1. Antes da atualização

Faça backup do PostgreSQL que o portal usa. Se `KLS_DATABASE_URL` aponta para outro banco, faça backup dele também. Guarde a versão anterior do código e confirme que consegue restaurar o backup.

Esta versão adiciona tabelas `kp_` e duas colunas em `kls_users`. A migração importa as empresas já existentes para o painel; não apaga os dados de salões, produtos, clientes ou vendas. Foi testada sobre o esquema do pacote KL Portal 1.0. Uma instalação diferente deve ser conferida antes.

As empresas existentes entram como **Ativas / Sem plano / R$ 0 / Sem bloqueio automático**. Nenhuma mensalidade antiga é presumida. Você configura os contratos depois de entrar no painel.

## 2. Adicione duas variáveis no Render

Abra **kl-portal → Environment → Edit**. Mantenha todas as variáveis atuais e adicione:

| Nome | Valor |
|---|---|
| `SUPERADMIN_EMAIL` | Seu e-mail administrativo |
| `SUPERADMIN_PASSWORD` | Uma senha exclusiva de 12 a 200 caracteres |

Essas variáveis criam a conta do superadmin somente no primeiro início da versão 2. Mudar a variável depois não altera uma senha existente. Para alterar sua senha depois, use **Minha senha** no painel.

Não substitua `DATABASE_URL`. Não crie outro PostgreSQL. Não remova `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `KLS_ADMIN_USER` ou `KLS_ADMIN_PASSWORD` neste procedimento.

## 3. Atualize os arquivos no mesmo repositório

Extraia o ZIP. Abra a pasta extraída e envie **os arquivos e pastas do projeto** para a raiz do repositório que o serviço já usa, substituindo os arquivos anteriores.

Você deve ver na raiz: `Dockerfile`, `server.mjs`, `package.json`, `portal.html` e as pastas `admin`, `beauty`, `mercado`, `scripts`, `tests` e `qa`.

Não envie o ZIP fechado. Não coloque os arquivos dentro de uma nova subpasta no repositório. A pasta `admin` é nova e obrigatória.

Se usa Git, copie os arquivos para seu checkout existente e, dentro dele, execute:

```bash
git add .
git commit -m "Adicionar superadmin e controle multiempresa"
git push
```

No Render, mantenha **Docker**, Root Directory vazio e Dockerfile Path `./Dockerfile`, se os arquivos estão na raiz. Health Check Path continua `/healthz`.

Com auto-deploy ativo, o envio inicia a atualização. Caso contrário, use **Manual Deploy → Deploy latest commit**. Espere o status Live.

## 4. Entre no superadmin

Abra o endereço do seu portal e clique **Administração da plataforma**, ou acrescente `/admin/` ao endereço:

```text
https://kl-portal.onrender.com/admin/
```

Entre com `SUPERADMIN_EMAIL` e `SUPERADMIN_PASSWORD`. Os acessos antigos do Beauty e do mercado continuam sendo acessos aos aplicativos, não ao superadmin.

## 5. Configure uma empresa existente

Clique **Administrar → Contrato**:

1. Confira nome, documento e contato.
2. Defina o plano e o valor da mensalidade.
3. Informe o próximo vencimento que você deseja cobrar.
4. Defina a tolerância em dias.
5. Marque bloqueio automático somente se deseja aplicar essa regra.
6. Informe o motivo e salve.

Um vencimento no passado gera mensalidades retroativas a partir dessa data, uma por competência mensal, até o dia atual. Não coloque uma data antiga apenas para registrar a data de abertura da empresa.

Exemplo: vencimento dia 10, tolerância 3 dias. O valor aparece vencido a partir do dia 11; o bloqueio começa no dia 14, se ainda houver saldo e a opção automática estiver ativa.

O calendário financeiro usa America/Sao_Paulo. Datas dia 29, 30 ou 31 são ajustadas para o último dia quando necessário, mantendo o dia original nos meses seguintes.

## 6. Cadastre uma nova empresa e seus usuários

Em **Cadastrar empresa**, escolha KL Beauty ou KLSistemas, preencha contrato, login e senha inicial. A empresa começa vazia, com seu administrador próprio.

Para a mesma organização usar ambos, cadastre uma empresa em cada sistema. Esta versão mantém contratos, credenciais e mensalidades independentes por sistema; não existe cobrança conjunta automática.

Na empresa, abra **Usuários**:

- **Criar usuário:** cria um login novo e já o vincula à empresa.
- **Vincular conta existente:** associa uma conta que já existe. O Beauty suporta a mesma conta em vários salões. No mercado, cada login deve pertencer a uma única empresa.
- **Administrar:** altera perfil, ativa/desativa ou define uma nova senha. A senha em branco mantém a atual.

No Beauty, os perfis são Administrador, Recepção e Financeiro, com as regras de negócio existentes. Recepção tem visão financeira limitada; Financeiro não é um perfil de leitura apenas. O proprietário do salão mantém o perfil Administrador.

No KLSistemas, Administrador tem acesso integral ao negócio e Consulta permite ler os dados, mas não gravar. Consulta também vê informações financeiras. Não existe um perfil de caixa com edição restrita a vendas nesta versão: a API antiga grava o estado completo, e esconder botões não garantiria essa restrição.

A desativação e a troca de senha revogam as sessões. Nas contas Beauty compartilhadas entre salões antigos, desativar ou trocar a senha afeta a conta em todos eles. O perfil é definido por salão.

O cadastro público de empresas do mercado fica desativado. Criação de salões e alteração de vínculos pelo Beauty passam a ser feitas pelo superadmin.

## 7. Controle as mensalidades

Na empresa, abra **Mensalidades**:

- A geração automática roda no início do serviço e a cada minuto enquanto ele está funcionando. Abrir a lista de empresas também processa os vencimentos.
- **Gerar próximo vencimento** antecipa a emissão do próximo mês configurado. Há uma mensalidade por empresa, sistema e competência mensal.
- **Registrar recebimento:** confira o dinheiro recebido e informe valor, forma e referência do comprovante.
- Recebimentos parciais abatem o saldo; não liberam uma dívida ainda vencida após tolerância.
- **Estornar registro:** corrige um recebimento lançado incorretamente e reabre o saldo, mantendo o histórico. Não faz devolução bancária.
- **Cancelar mensalidade:** exige que não exista recebimento líquido. Estorne os recebimentos primeiro, se necessário.

A liberação automática exige que não reste outra mensalidade vencida além da tolerância. Pagamento não reativa uma empresa suspensa ou cancelada manualmente.

Os valores são armazenados em centavos. A mensalidade contratada exibida no painel não é dinheiro recebido. Recebimentos líquidos aparecem no detalhe da empresa; saldo vencido não inclui valores futuros.

## 8. Suspensão, cancelamento e reativação

Em Contrato, altere a situação e informe o motivo:

- **Suspensa:** bloqueia acesso e interrompe novas emissões automáticas enquanto suspensa.
- **Cancelada:** bloqueia acesso e interrompe novas emissões automáticas; preserva dados e dívidas.
- **Ativa:** permite acesso se não houver bloqueio automático por atraso.

Ao reativar, ajuste o próximo vencimento conforme o acordo. Se mantiver uma data antiga, as competências pendentes serão geradas. Não há cálculo proporcional, multa, juros, descontos ou devolução automática.

O bloqueio vale nas requisições ao servidor, inclusive em sessões existentes. Dados que já estavam carregados na tela não podem ser recolhidos, mas novas leituras e gravações serão recusadas.

## 9. Exclua e restaure cadastros

No painel, abra o contrato da empresa, mude a situação para **Cancelada** e salve. Em seguida, use **Excluir empresa**, digite o nome exato e informe o motivo. O acesso fica bloqueado, a empresa sai da lista normal e deixa de contar nos indicadores e nas novas mensalidades.

A exclusão é reversível: os dados operacionais, usuários, mensalidades, recebimentos e auditoria ficam preservados. Para localizar o cadastro, filtre a situação por **Excluída**; abra a empresa e use **Restaurar cadastro**. A restauração mantém o contrato cancelado e o acesso bloqueado. Depois, se for apropriado, reative o contrato manualmente.

Essa ação não apaga permanentemente os registros do banco.

## 10. Feche acessos antigos que contornem as regras

Se `klsistemas.onrender.com` ou outra instalação antiga usa o mesmo banco, ela não conhece necessariamente o controle de assinaturas desta versão. Um cliente pode continuar entrando por essa instalação antiga.

Depois de confirmar que a versão nova está funcionando e que os registros estão preservados, desative o serviço antigo ou atualize-o com controles equivalentes. **Não exclua o banco.** A regra do superadmin não se aplica automaticamente a outro programa que usa as mesmas credenciais do banco.

## 11. Conferência após publicar

- Entre no superadmin e confira as empresas existentes.
- Entre no Beauty e no mercado e confira os registros antigos.
- Crie uma empresa de teste e um usuário em cada aplicativo.
- Suspenda a empresa de teste e confirme que uma sessão já aberta não salva mais.
- Configure uma mensalidade de teste vencida, registre a quitação e confirme a liberação.
- Reinicie o serviço e confira contratos, usuários e recebimentos.

Use dados fictícios nessas verificações. Depois cancele os contratos de teste para manter o histórico sem operação ativa.

## Escopo financeiro

Esta entrega controla contratos e registra pagamentos manualmente. Ela não emite Pix, boleto, nota fiscal, faz débito em cartão, concilia extratos ou envia cobranças por WhatsApp/e-mail. Registrar uma forma como Pix ou Boleto documenta como você recebeu; não gera uma cobrança.

A integração automática com um provedor de pagamentos é uma etapa separada, com credenciais, webhooks validados e regras de reconciliação.

## Recuperação de senha do superadmin

Com sessão aberta: clique **Minha senha**.

Se perdeu a senha, há um utilitário `scripts/reset-superadmin.mjs` para o responsável técnico executar com Node 24 e acesso autorizado ao PostgreSQL. Configure `DATABASE_URL`, `DATABASE_SSL`, `RESET_EMAIL` e `RESET_PASSWORD` no ambiente local; para acesso externo use a URL externa e `DATABASE_SSL=verify`. Execute na raiz:

```bash
node scripts/reset-superadmin.mjs
```

O utilitário altera a senha e revoga as sessões. Remova as variáveis de recuperação depois. Não envie credenciais ao GitHub ou ao chat.

## Testes e limites

Veja `VALIDACAO.md`. Os testes locais não substituem a conferência de sua instalação real. Não foi realizado deploy automático, teste de carga ou auditoria externa de segurança desta atualização.

Atualização do mercado: veja `MERCADO_PESO_CAMERA.md` para cadastro de atalhos, venda por peso e câmera. Não há novas variáveis de ambiente.
