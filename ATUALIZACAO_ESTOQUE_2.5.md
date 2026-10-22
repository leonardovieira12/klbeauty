# Atualização completa — Portal 2.4.0 / Mercado 2.5.0

## Categorias no estoque
Abra **Produtos e estoque → Categorias**. Digite o nome e clique em **Criar categoria**. A categoria fica salva para essa empresa mesmo sem nenhum produto vinculado e aparece no filtro do estoque e no cadastro de produtos. As categorias já utilizadas são preservadas.

No produto, **Categoria do produto** é uma lista de seleção, sem campo de sugestões. Também é possível criar uma categoria pelo cadastro, escolhendo **Outra categoria…**. Categoria e unidade são independentes: PADARIA pode conter produtos por KG e por UN.

## Alterar o saldo de um produto existente
Abra **Editar**, altere **Quantidade em estoque (saldo total)** e preencha o motivo. O número informado é o saldo final: informar 20 define o estoque como 20, não acrescenta 20. O botão **Alterar estoque** também oferece definir saldo, adicionar quantidade ou registrar perda. Zero é permitido; campo vazio não é interpretado como zero.

O botão **Histórico** mostra os ajustes feitos nesta versão, com saldo anterior, saldo novo, unidade e motivo. Registros anteriores continuam na auditoria. Uma redução por contagem, dentro da mesma unidade, registra perda pelo custo anterior. Entradas de ajuste não geram automaticamente contas a pagar; compras continuam pela nota de entrada.

## Trocar KG por unidade ou unidade por KG
Produtos com histórico podem mudar de unidade. Em **Editar**, selecione a nova unidade, informe o saldo real na nova unidade e confira preço, custo e estoque mínimo. Preencha o motivo e marque a confirmação antes de salvar. Não existe conversão automática entre quilos e peças, pois a equivalência depende do produto.

A troca não modifica quantidades, preços ou unidades das vendas anteriores. Novas vendas usam a unidade atual. A alteração fica registrada. Se o produto estiver na sacola aberta neste navegador, remova-o da sacola antes de alterar a unidade e depois adicione novamente.

No cancelamento de uma venda anterior à troca, o sistema solicita quanto efetivamente será devolvido na unidade atual. Por exemplo: se a venda foi em KG e hoje o produto é por UN, informe quantas unidades voltam. O valor financeiro estornado continua sendo o valor original da venda. A conferência também é exigida quando um produto passou de KG para UN e depois retornou a KG.

## Publicar e verificar a versão
1. Extraia este ZIP completo. O arquivo Dockerfile deve ficar na raiz do repositório, junto de server.mjs e das pastas mercado, beauty e admin.
2. Substitua os arquivos correspondentes no mesmo repositório e confirme o commit na branch utilizada pelo serviço Render. Não envie apenas o ZIP fechado.
3. No serviço do portal, publique o commit atualizado. O Dockerfile compila o mercado com os arquivos de interface embutidos no executável.
4. Depois do deploy concluído, reabra o portal. Em **Produtos e estoque**, o subtítulo precisa mostrar **Versão 2.5.0**. A versão do pacote completo é 2.4.0; a versão do mercado é 2.5.0.
5. Se continuar aparecendo 2.4.0 ou 2.4.1 no mercado, confira o repositório, a branch e o commit do deploy: essa tela ainda está servindo uma versão anterior.

A instalação usa o banco e as variáveis de ambiente existentes. Não importe um backup para instalar esta atualização. Os novos campos são incorporados ao estado da empresa, sem apagar cadastros.

## Validação
Compilação Linux, testes Go, suíte integrada com banco PostgreSQL compatível em memória e testes de interface. Inclui persistência e isolamento das categorias, saldo editável, validação de quantidades, troca de unidade com histórico e devolução de vendas antigas. A câmera física e a publicação no Render não foram executadas nesta revisão.
