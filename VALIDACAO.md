# Validação — KL Portal 2.3

Validação original em 20/10/2026; atualização do mercado validada em 21/10/2026. Esta é uma atualização de código; não foi publicada automaticamente no serviço do usuário.

| Camada | Resultado |
|---|---|
| KL Beauty — domínio, segurança, autenticação, API e persistência | 69 testes aprovados |
| Superadmin — migração, isolamento, contratos, usuários, mensalidades e auditoria | 27 testes aprovados |
| Gateway — caminhos, redirecionamentos, arquivos, health check e superadmin | 10 testes aprovados |
| KLSistemas — autenticação, empresas, limites e impressão | 8 testes Go aprovados |
| Conjunto Node + Go com banco PGlite por protocolo PostgreSQL | 34 verificações HTTP aprovadas |
| Interface superadmin em JSDOM com API do conjunto e banco de teste | 21 verificações aprovadas |
| TypeScript / Vite e binário Linux do KLSistemas | Compilação aprovada |

As contagens Node incluem os testes agrupadores apresentados pelo runner. As verificações HTTP/DOM são asserções de fluxos, não auditorias independentes.

## O que foi exercitado

- Migração sobre empresas existentes sem perda de estado e sem bloqueio financeiro inicial.
- Isolamento entre empresas, credencial de cliente sem acesso ao superadmin e proteção de origem.
- Criação atômica de empresa/usuário; rollback em login duplicado.
- Geração idempotente por competência e preservação do dia de vencimento em meses curtos.
- Recebimento parcial, repetição de requisição sem duplicação, recusa de valores excedentes e negativos.
- Quitação, liberação automática, estorno, reabertura de saldo e cancelamento de mensalidade.
- Exclusão restaurável: exige contrato cancelado, confirmação pelo nome exato, bloqueia acesso, preserva dados/histórico e restaura mantendo contrato cancelado.
- Cancelamento manual que permanece bloqueado mesmo após pagamento.
- Bloqueio de sessão já aberta nos dois sistemas.
- Perfil consulta do mercado impedido de gravar no servidor.
- Criação, vínculo, desativação e troca de senha de usuários; revogação de sessões.
- Auditoria sem senhas e controle de versão do contrato para recusar tela desatualizada.
- Formulários do painel: autenticação, empresa, usuário, recebimento, estorno, cancelamento, exclusão/restauração, filtro e histórico.

## Limites da validação

PGlite executa o motor PostgreSQL em WebAssembly; a suíte integrada utiliza seu adaptador de socket com os clientes Node pg e Go pgx. Isso valida as consultas e os fluxos locais, mas não reproduz todas as condições de concorrência, falhas de rede, recursos e configuração de um PostgreSQL remoto.

Não houve teste de carga, auditoria externa de segurança, execução da imagem Docker v2, inspeção visual em navegador real ou publicação desta atualização no Render. JSDOM verifica comportamento de formulários, não aparência rasterizada. Não foram acessados dados de produção.

Não há garantia de ausência de bugs nem alegação de 100 revisões por linha. Faça backup e valide a instalação após publicar conforme ATUALIZAR_PARA_V2.md.

## Reproduzir testes básicos

Pré-requisitos: Node 24 e Go compatível com mercado/go.mod. Na raiz do pacote:

```bash
cd beauty
npm ci --include=dev
npm run build
npm test
cd ..
npm run test:admin
npm run test:gateway
cd mercado
go test ./...
go build -buildvcs=false -o ../bin/klsistemas .
cd ..
```

## Reproduzir integração e interface

Em Linux, após os comandos acima:

```bash
cd qa
npm ci
npm test
```

A suíte sobe um banco descartável em memória no socket local 15439 e uma instância de teste do portal na porta 18090; o Go usa a porta 10001. As portas precisam estar livres. Os dados e senhas presentes nos testes são exclusivamente fictícios. A conexão é sobrescrita para o banco local, e nenhum DATABASE_URL de produção é usado pela suíte integrada.

O diretório qa não entra na imagem de produção. Para publicação no Render, não é necessário instalar essas dependências manualmente.

## Adições da atualização de mercado (21/10/2026)

- 62 verificações do mercado no conjunto com banco de teste: cadastro sem código, atalho exclusivo, busca ambígua, KG/gramas, multiplicadores, limites, total, persistência, nota, perda, cancelamento e leitura única da câmera.
- 61 verificações de regressão do mercado com API local real: venda, fiado, entrada XML, estoque, caixa, exportação, impressão e telas.
- Decodificador incluído validado com imagens sintéticas EAN-13 e EAN-8.
- Permissões e encerramento da câmera validados por simulação. Não houve teste com sensor físico de Android/iPhone.
- O build Linux do Go incorpora camera.js e o decodificador. A biblioteca acompanha o pacote; nenhuma chave externa é necessária.

A suíte atual inclui `qa/market-dom.cjs`. As contagens da tabela principal para Beauty e superadmin registram a validação anterior; essas partes não foram alteradas nesta atualização.

## Consolidação 2.3

Inclui toda a atualização anterior e: atalho com abertura automática em 450 ms (ou Enter), categoria em lista visível e independente da unidade, categoria personalizada, seleção explícita entre venda por unidade ou peso, multiplicador x, câmera no cadastro preservando formulário e leitura direta para sacola na venda por unidade. O teste de mercado cobre também 3x antes da câmera, código desconhecido, produto por KG exigindo peso e cancelamento da câmera sem perda do cadastro.
