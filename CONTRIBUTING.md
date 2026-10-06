# Desenvolvimento e revisão

Leia [a arquitetura](docs/architecture.md) antes de alterar coleta, edição do mapa ou persistência. Instale com `npm ci` e use `npm run dev` na raiz.

- Organize por responsabilidade. Componentes visuais recebem dados/callbacks; hooks coordenam estado; regras independentes ficam no domínio; IO fica nos serviços/repositórios.
- Use classes para encapsular estado e dependências. Cálculos sem estado e componentes React permanecem funções.
- Documente em português a intenção, limites e invariantes de métodos públicos e regras não óbvias. Evite comentários que apenas repetem uma atribuição.
- Preserve contratos e dados legados. Toda alteração de schema exige avaliar leitura, edição e migração separadamente.
- Execute `npm run format`, `npm run format:check`, `npm run lint`, `npm test` e `npm run build`. Acrescente regressões para comportamentos novos ou falhas corrigidas.
- Revise segurança no servidor: autenticação de escrita, origem, validação, limites de payload, execução sem shell e destino de HTTP/TCP.
- Não versionar dados da instalação, tokens, arquivos `.env`, builds ou `node_modules`.

Uma revisão deve explicar o comportamento alterado, os testes executados e limites conhecidos. Atualize versão e notas de release quando a entrega for publicada; cada versão recebe sua própria release no GitHub.
