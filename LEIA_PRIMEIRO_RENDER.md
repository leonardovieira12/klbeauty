# KL Portal 2.4

Para atualizar o portal que já está funcionando, abra **ATUALIZAR_PARA_V2.md**. Ele contém todos os passos, variáveis, comandos e regras de operação.

Não crie outro banco. Preserve DATABASE_URL e adicione SUPERADMIN_EMAIL e SUPERADMIN_PASSWORD antes de publicar esta versão.

Para uma instalação nova, use um Web Service Docker com este Dockerfile na raiz, o PostgreSQL escolhido em DATABASE_URL, e todas as variáveis do arquivo .env.example preenchidas no painel do Render. Nunca publique senhas no repositório.

A administração central estará em /admin/.

Atualização do mercado: veja `MERCADO_PESO_CAMERA.md` para cadastro de atalhos, venda por peso e câmera. Não há novas variáveis de ambiente.

Correção de estoque e categorias: veja `ATUALIZACAO_ESTOQUE_2.5.md`. A versão exibida no mercado deve ser **2.5.0** após publicar.
