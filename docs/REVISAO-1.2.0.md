# Revisão técnica 1.2.0 — 14/09/2026

A revisão cobre riscos concretos encontrados na base 1.1.0. Não é uma prova de todas as combinações possíveis de rede, sistema operacional e hardware.

| Área | Problema identificado | Resultado |
| --- | --- | --- |
| Windows ICMP | Exit code 0 podia significar destino inalcançável | Exige resposta com tempo, incluindo inglês e português |
| Coletor | Ping ausente/permissão local virava queda de todos os hosts | Erro do coletor torna status desconhecido e não altera perda de pacotes |
| Oscilação | Perda isolada podia confundir interpretação | Duas falhas consecutivas confirmam queda; 81 sequências testadas |
| Reinício | Incidente aberto podia perder o início ou duplicar eventos | Reconciliação com o último evento persistido |
| Histórico | JSON inválido era descartado silenciosamente | Inicialização falha explicitamente sem sobrescrever o arquivo |
| Concorrência | Quantidade ilimitada de processos e refresh prematuro | Máximo configurável de pings e ciclo compartilhado |
| Conexão | Dados fictícios apareciam automaticamente sem backend | Espera vazia na primeira conexão; preserva último resultado com aviso na desconexão |
| WebSocket | Conexão sem atualização podia parecer ao vivo | Watchdog de dados desatualizados e reconexão |
| HTTP | Requisições podiam ficar pendentes sem limite | Timeout e mensagem em atualização manual |
| Detalhes | Só havia últimos 30 eventos de toda a rede | Busca histórico por host; informa falha de carregamento |
| Acessibilidade | Detalhes não prendiam/restauravam foco | Dialog nativo, Escape, fechamento por fundo |
| Configuração | Interface sempre dizia 5 segundos | Intervalo recebido do backend |
| Publicação | Sem verificação automatizada | CI preparada para Windows/Linux e Node 22/24 |

## Verificação executada

- 117 testes: 32 combinações de parsing, 81 sequências de estado, validação de endereços, concorrência, reinício e persistência.
- Compilação TypeScript/Vite e lint.
- Testes de rede usam respostas controladas: não afirmam disponibilidade dos IPs da empresa.
- Não houve validação visual em navegador nesta revisão: Playwright estava disponível, mas o executável Chromium não estava instalado.
- CI foi preparada, mas só poderá executar no GitHub após publicação.

## Limites e próximos passos

1. Cadastro/seleção de IPs pelo painel continua pendente da decisão do gestor. O cadastro atual permanece em `backend/src/config/hosts.ts`.
2. O histórico de eventos fica em JSON (até 5.000 eventos / retenção configurada); amostras de latência continuam em memória. Para relatórios mensais e grande volume, migrar para SQLite com migrações e backup.
3. Percentual exibido por host mede respostas na janela de amostras, não SLA temporal de 30 dias. A duração de um incidente recuperado após reinício inclui período sem observação e não prova queda contínua.
4. ICMP não prova disponibilidade de um serviço. Adicionar testes TCP/HTTP por serviço conforme necessidade, sem chamar falha de ICMP de falha confirmada de toda a rede.
5. Autenticação e perfis são necessários antes de expor administração pela internet. Esta versão serve à intranet, sem login.
6. Testar IPv6 e outros idiomas do Windows em equipamentos reais; parsing Windows reconhece tempo/time. macOS não faz parte do suporte validado.
7. Fazer inspeção visual em TV real, 1920×1080, mobile, zoom de 200% e ambos os temas. A base mantém claro padrão e preferência local.
8. Evoluções sugeridas: alertas com silenciamento, janelas de manutenção, filtros por grupo, exportação de incidentes e configuração de retenção pela interface.

## Atualização segura

Preserve `.env`, `backend/storage` e sua lista real de hosts antes de substituir a versão. Esses dados não fazem parte da publicação pública. Não publique inventário interno nem certificados corporativos.
