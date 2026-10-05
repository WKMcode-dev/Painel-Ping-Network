# Revisão de segurança — v1.10.1

Data: 05/10/2026. Escopo: código do frontend/backend, rotas HTTP, WebSocket, execução ICMP, verificações TCP/HTTP, armazenamento, dependências e testes locais. Não foi feito pentest na infraestrutura da empresa, inspeção do firewall, testes de certificados implantados ou varredura de dispositivos reais.

A revisão combinatória verifica cenários definidos; ela não demonstra segurança contra todos os ataques possíveis. Ocultar dados da apresentação e controlar autorização são proteções diferentes.

| Área | Achado / proteção aplicada | Evidência e limite |
| --- | --- | --- |
| Alterações sem autorização | API de escrita antes acessível sem credencial. Agora exige chave forte e validação de origem. | 36 combinações de quatro métodos, três credenciais e três origens; origem ausente ainda exige chave. |
| CSRF e origens | Validação de origem em operações protegidas e WebSocket; credencial não fica em cookie nem URL. | Domínios parecidos/externos negados; mesma origem HTTPS atrás de proxy permitida. O Host do proxy precisa ser preservado. |
| Exposição na TV | Remoção de endereços em cards/mapa e máscara em textos/avisos antigos. | IPv4 e IPv6 em quatro campos de exibição testados. Consultas e detalhes continuam públicos na rede: não é controle de leitura por usuário. |
| Desvio dos campos | IPs literais rejeitados nos campos de texto pelo servidor; formulário também valida. | Novos cadastros/textos protegidos; arquivos antigos carregam intactos. Não é uma prevenção geral contra divulgação intencional/endereços escritos por extenso. |
| SSRF / DNS | URL do serviço vinculada ao dispositivo; conexão HTTP fixada no IP já resolvido. Host e SNI originais preservados, certificado validado para o hostname original. | Teste com hostname sem resolução e IP local confirma que não ocorre segunda resolução. Metadados IPv4/IPv6 conhecidos e link-local negados; LAN/loopback monitorados permanecem possíveis por decisão do administrador. |
| Injeção de comandos | Ping recebe argumentos separados, sem shell, após validar endereço. | Testes de opções, comandos e endereços inválidos já presentes. Não se executam textos de nomes/mapa. |
| XSS e conteúdo | Textos renderizados como texto React/DOM, sem innerHTML; propriedades de cor/formato limitadas por esquema. CSP em produção, bloqueio de iframe e MIME sniffing. | Revisão de renderização e schemas. Estilos inline são permitidos para cores e posições; CSP não substitui correções de XSS. |
| Abuso / DoS | 120 operações e 600 leituras por minuto por IP/bucket; buckets público/admin separados; corpo 2 MB; limites HTTP/WS. | Tests de limite, JSON inválido, corpo grande, mensagens WS grandes e manutenção do serviço. Não protege contra DoS distribuído ou saturação da rede. Atrás de proxy, clientes podem compartilhar o bucket do proxy; X-Forwarded-For não é confiado. |
| WebSocket | Origem verificada; 32 conexões; payload 1 KB; canal de leitura; clientes com buffer >2 MB são encerrados. | Origem hostil negada; mensagem acima do limite não derruba o processo. Clientes nativos sem Origin podem consultar a rede, dentro do modelo de leitura pública. |
| Credencial | 256 bits aleatórios, armazenamento separado e criação exclusiva; chmod 600 onde suportado; nunca retornada pelas APIs. | Persistência testada, chave ignorada pelo git. É mostrada uma vez no provisionamento local; logs dessa primeira execução precisam ser tratados como confidenciais. ACLs Windows/conta de serviço são responsabilidade da implantação. |
| Persistência | Validação de leitura compatível com arquivos antigos, gravações atômicas, revisão otimista do mapa e trava de armazenamento. | Teste específico preserva cadastro antigo com IP no nome. Backup continua necessário; não foi implementada criptografia dos arquivos. |
| Dependências | Três instâncias de brace-expansion atualizadas: 1.1.21 e 5.0.12. | npm audit: 0 alertas conhecidos em 05/10/2026. Novos avisos podem aparecer posteriormente. |

## Cuidados de implantação ainda necessários

1. HTTPS para a interface/API administrativa e WSS quando acessar pela rede; a aplicação continua com servidor HTTP por padrão. Sem TLS, a chave pode ser interceptada por quem tiver acesso ao tráfego.
2. Firewall/VPN/rede autorizada: a leitura de status e detalhes não tem autenticação nesta versão. Não publicar o serviço aberto na internet se dados da rede forem confidenciais.
3. Guardar/rotacionar a chave e proteger a pasta fixa/backup. O modelo usa uma chave compartilhada, sem auditoria individual, expiração de sessões ou MFA.
4. Controlar quais destinos o servidor pode alcançar por regras de saída. Verificar serviços internos é uma função deliberada do painel; o administrador com a chave mantém essa capacidade.
5. Reavaliar dependências e fazer pentest da implantação real quando houver exposição maior ou novos papéis de usuários.

## Referências

- [OWASP — prevenção de SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).
- [Express — segurança em produção](https://expressjs.com/pt-br/advanced/best-practice-security/).
- [OWASP — prevenção de CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

Validação local: 259 testes, lint e builds de frontend/backend. A CI da release verifica Windows/Linux com Node 22/24. Gestos físicos em notebook/TV e as configurações da rede da empresa não foram testados neste ambiente.
