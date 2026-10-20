# Validação da entrega

Verificação concluída em 20/10/2026, antes da publicação no Render.

| Verificação | Resultado |
|---|---|
| Beauty: testes de domínio, autenticação, segurança e API com PGlite | 69 testes aprovados |
| Beauty: TypeScript e compilação Vite com base `/beauty/` | Aprovados |
| Portal: roteamento, redirecionamentos, encaminhamento HTTP, arquivos e health check | 9 testes aprovados, incluindo o agrupador |
| KLSistemas: testes Go de autenticação, empresas, limite de login e impressão | 7 testes aprovados |
| KLSistemas: compilação Linux | Binário gerado |
| KLSistemas: interface multiempresa em JSDOM | Fluxo de login/cadastro aprovado com API simulada |
| KLSistemas: fluxos DOM com API local real | 61 verificações aprovadas |

O teste DOM cobre produtos, vendas, estoque, fiado e recebimentos parciais, fornecedores, notas/XML, custos, contas, cancelamentos, exportações, concorrência e CSRF. O adaptador de teste remove `/mercado` porque conversa diretamente com o servidor Go; o gateway é testado separadamente.

Limites: não foi construída/executada a imagem Docker neste ambiente; não foi realizado deploy no Render, teste de carga, revisão visual em navegador real ou teste integrado dos dois aplicativos com PostgreSQL remoto. Os testes Go de nuvem não substituem essa validação real. A migração de dados existentes não foi executada. Impressão nativa Windows não foi testada nesta entrega.

A revisão e os testes reduzem riscos, mas não garantem ausência de bugs. Não houve 100 revisões de cada linha, e essa contagem não seria uma garantia de qualidade. Faça a conferência pós-publicação descrita no guia antes de operar com dados reais.

## Reproduzir testes adicionais da interface do mercado

Além dos comandos do guia, com Node e Go instalados, na pasta `mercado`:

```bash
npm install --no-save --package-lock=false jsdom@30.1.3
go build -o klsistemas-test .
node tests/multitenant-ui.cjs
node tests/dom-integration.cjs
```

Esses comandos são para ambiente Linux/macOS de desenvolvimento. O teste local inicia a porta 18763 e grava somente numa pasta temporária. Não o execute apontando para o banco de produção. JSDOM verifica comportamento da interface, mas não sua aparência renderizada.
