# KL Portal 2.3 — KLSistemas 2.4: atalhos, peso e câmera

## Atualizar

Faça backup do banco. Extraia o ZIP e substitua o conteúdo da raiz do mesmo repositório no GitHub. O Dockerfile deve continuar na raiz. Aguarde a publicação no Render ou use Manual Deploy → Deploy latest commit. Mantenha DATABASE_URL e as demais variáveis: esta atualização não exige nenhuma variável nova. O pacote contém os dois sistemas e o superadmin; as novidades deste arquivo são no mercado.

O ZIP contém diretamente os arquivos do projeto. Não envie o ZIP fechado nem crie uma subpasta extra no repositório. Para quem usa Git, após substituir os arquivos no checkout existente:

```bash
git add .
git commit -m "Adicionar atalhos, produtos por peso e leitor de camera ao mercado"
git push
```

## Cadastrar produtos sem código de barras

Em Produtos e estoque → Novo produto, o código de barras pode ficar vazio. Preencha o nome, o atalho e a categoria. A categoria aparece em uma lista visível com FRIOS, PADARIA, BEBIDAS e outras categorias já usadas. Para uma categoria nova, selecione “Outra categoria…” e digite o nome. Em um campo separado, escolha se o produto será vendido por unidade/quantidade (UN) ou por peso em quilos (KG). FRIOS e PADARIA podem usar qualquer uma das duas unidades; a categoria não determina a forma de venda.

| Produto | Atalho | Unidade | Preço de exemplo | Estoque de exemplo |
|---|---|---|---|---|
| Mussarela | MU | Quilograma (KG) | R$ 40,00 por kg | 5,500 kg |
| Pão francês | PP | Unidade (UN) | R$ 0,80 por pão | 100 unidades |

O atalho é exclusivo no catálogo e não diferencia maiúsculas de minúsculas. MU e mu identificam o mesmo produto. VA continua reservado para valor avulso; atalhos iniciados por número seguido de X são reservados ao multiplicador. O sistema recusa atalhos que coincidam com códigos/atalhos já usados por outro produto.

## Vender

No campo de leitura do PDV, digite o atalho ou parte do nome. As sugestões aparecem abaixo. Ao digitar um atalho cadastrado exatamente, a tela abre automaticamente após uma breve pausa (450 ms). Enter também confirma imediatamente. Para uma busca parcial, selecione o produto nas sugestões:

- `MU`: abre o lançamento de peso. Você pode escolher kg ou gramas. 250 g a R$ 40/kg resultam em R$ 10,00 e baixa de 0,250 kg.
- `PP`: abre o lançamento de quantidade. 6 pães a R$ 0,80 resultam em R$ 4,80 e baixa de 6 unidades.
- `0,250xMU` ou `0.250xMU`: adiciona diretamente 0,250 kg.
- `6xPP`: adiciona diretamente 6 unidades.
- Um código de barras de produto por unidade adiciona 1 unidade; `3xcódigo` adiciona 3.
- Um código de barras de produto em KG abre o lançamento de peso.

Se a busca encontrar vários produtos, escolha na lista. Nenhum deles é lançado automaticamente por aproximação. Quantidades podem ser ajustadas na sacola. O multiplicador agora usa x: `3xPP`, `3x7891234567890` ou digite `3x` e então leia o código. Aceita x, X e ×. O formato antigo com asterisco foi desativado.

Produtos em KG aceitam até três casas decimais: resolução de 1 grama. Não é permitida fração de unidade, caixa ou pacote. Preço e custo são sempre por unidade cadastrada, portanto em KG informe o preço de **um quilo**. Os totais monetários são arredondados para centavos por item.

A unidade pode mudar em produtos com estoque e histórico. Ao editar, selecione a nova unidade, informe o saldo real nela, confira preço e custo, preencha o motivo e marque a confirmação. Vendas antigas mantêm sua unidade, quantidade e valores. Se houver o produto na sacola ainda aberta, remova-o antes de trocar a unidade.

## Ler com a câmera do celular

Abra o portal HTTPS no navegador, entre no mercado e vá à Frente de caixa. Toque em **Ler com câmera**, permita o acesso e enquadre o código de barras com boa iluminação. A câmera traseira é solicitada preferencialmente. O código cadastrado por unidade entra automaticamente na sacola, sem botão de confirmação. Se você digitou `3x` antes de abrir a câmera, serão adicionadas 3 unidades. Um produto por KG abre a tela de peso, porque o código comum não informa quanto foi pesado. Código desconhecido não adiciona nada: o caixa deve conferir o cadastro.

Cada abertura aceita um código e encerra a câmera. Para o próximo produto, abra novamente. Fechar a janela, sair da página ou colocar o navegador em segundo plano também encerra a leitura. Essa regra evita lançamentos repetidos do mesmo código pelos vários quadros do vídeo.

A leitura ocorre no navegador. As imagens da câmera não são enviadas ao servidor. O leitor está incluído no próprio pacote, sem depender de um CDN externo para carregá-lo. Não exige aplicativo Android ou chave de API.

Se a permissão for negada, libere Câmera nas permissões do site. Se estiver ocupada, feche outro aplicativo que esteja usando a câmera. O leitor suporta formatos lineares comuns por meio do ZXing, incluindo EAN-13 e EAN-8. A qualidade da câmera, foco, iluminação e impressão influenciam a leitura.

## Escanear ao cadastrar no estoque

Em Produtos e estoque → Novo produto ou Editar, toque em **Escanear código do produto**, ao lado do campo Código de barras. Autorize a câmera e enquadre o código. O campo será preenchido automaticamente; nome, categoria, preço, unidade e demais campos digitados permanecem no formulário. Confira e pressione Salvar.

Cancelar a leitura ou negar permissão não descarta o cadastro. A leitura no cadastro não adiciona itens à sacola e não salva o produto sem sua confirmação. Código já usado em outro produto é recusado ao salvar.

## Estoque, entradas e cancelamento

Ajustes, perdas, notas de entrada e cancelamentos de venda respeitam a unidade. O cancelamento repõe a quantidade vendida quando a unidade não mudou. Se houve troca de unidade depois da venda, pede a quantidade física devolvida na unidade atual, inclusive quando a unidade mudou e depois voltou à original. Comprovantes e exportações de vendas exibem a unidade.

Na entrada de NF, quantidade e custo devem estar na unidade cadastrada. Se o XML informar unidade diferente, a gravação é impedida: faça a entrada manual com a conversão conferida. Não há conversão automática de caixa para unidade ou de gramas para kg no XML.

O peso é digitado pelo operador. Esta versão não integra balança física nem interpreta peso/preço embutido em etiquetas de balança.

## Verificação e limites

Foram exercitados cadastro sem código, atalhos duplicados, busca ambígua, conversão de gramas, multiplicadores, estoque fracionado, nota de entrada, cancelamento e persistência no conjunto Node + Go + PostgreSQL/PGlite. O decodificador incluído leu imagens sintéticas EAN-13 e EAN-8. O ciclo de permissão, leitura única, preservação de rascunho no cadastro e encerramento da câmera foi testado com câmera simulada. Também foi testada a abertura automática das telas ao digitar MU e PP sem Enter.

Não houve teste com câmera física de Android/iPhone nem publicação automática no seu Render. Após publicar, faça uma venda de teste de 250 g e uma leitura de código em seu celular, confira o valor e cancele a venda para conferir a reposição.

Biblioteca incluída: @zxing/browser 0.1.5 (MIT), com componentes @zxing/library (Apache 2.0). Licenças em mercado/web/ZXING-LICENSE.txt e ZXING-LIBRARY-LICENSE.txt. Documentação: https://github.com/zxing-js/browser.
