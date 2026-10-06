# Arquitetura e manutenção — Painel Ping

## Objetivo e limites

O projeto é um monorepo TypeScript com frontend React/Vite e backend Express. Esta organização separa apresentação, interação, regras de domínio, acesso externo e persistência. A versão 1.10.2 reorganiza o código sem alterar o formato de dispositivos, histórico ou mapa.

A aplicação mantém um backend por pasta de dados. Não é um sistema de edição colaborativa: o mapa usa revisão para recusar sobrescritas simultâneas. ICMP informa resposta de rede; TCP/HTTP medem serviços separadamente. As conexões do desenho são cadastradas pelo operador e não comprovam topologia física.

## Mapa de responsabilidades

| Módulo | O que pertence aqui | O que deve permanecer fora |
| --- | --- | --- |
| `frontend/src/app/App.tsx` | Composição das telas, seleção da seção e modo TV | Geometria de conexões e campos completos de formulários |
| `frontend/src/components/NetworkMap` | Canvas, balões, linhas, barra e painéis do mapa | Regras de roteamento e chamadas HTTP diretas |
| `frontend/src/features/topology/domain` | Funções de geometria, seleção, portas, junções, layout e viewport | React, DOM e acesso à API |
| `frontend/src/features/topology/hooks` | Gestos, câmera, comandos de balões e conexões | Renderização extensa e persistência direta |
| `frontend/src/features/topology/interaction` | Atalhos e tratamento do foco | Cálculos geométricos duplicados |
| `frontend/src/hooks/useTopology.ts` | Documento local, undo/redo, reconciliação e salvamento | JSX de campos e regras de sondagem |
| `frontend/src/services` | HTTP, erros e chave administrativa em memória | Regras geométricas e componentes |
| `backend/src/routes` e `controllers` | Contrato HTTP e tradução para operações da aplicação | Escrita direta no inventário em memória |
| `backend/src/validation` | Schemas de entrada e compatibilidade com dados armazenados | Leitura/escrita de arquivos |
| `backend/src/services/monitor.service.ts` | Ciclos, concorrência, configuração e snapshots | Reimplementação de métricas, incidentes ou persistência |
| `backend/src/domain/monitoring` | Regras de incidentes, contabilização e métricas | Express, execução do ping ou leitura de arquivos |
| `backend/src/repositories` | Carregamento e gravação de documentos | Decisões de apresentação |
| `backend/src/storage` | Localização persistente, migração e exclusão mútua | Estado local do navegador |
| `backend/src/security` | Chave administrativa, origens e destinos de serviços | Regras de disponibilidade |

`DeviceForm`, `HostPerformance` e `HostIncidentHistory` isolam formulários e seções de detalhes. No mapa, `MapToolbar`, `MapAppearance`, `MapTextBlocks`, `MapEdgeProperties`, `MapEdges` e `MapNodeView` concentram a apresentação de cada responsabilidade.

## Orientação a objetos e dependências

`MonitorService` orquestra o ciclo e recebe sondagem, repositório de histórico e relógio pelo construtor. Isso permite testar falhas e passagem do tempo sem depender da rede real.

`IncidentTracker` encapsula incidentes abertos, primeira falha e confirmação. `ObservationAccounting` encapsula a contabilização de tempo online, offline, desconhecido, pausado e em manutenção. Ambas são instâncias por serviço: não compartilhe essas classes globalmente entre coletores. `updateSampleMetrics` é uma função sobre a janela de amostras válidas, pois não precisa manter estado próprio.

Os repositórios encapsulam persistência. Schemas ficam em `validation`, mesmo quando reexportados por repositórios para compatibilidade. Em React, componentes funcionais e hooks compõem a interface; classes são usadas quando há estado e ciclo de vida de domínio a encapsular. Evite hierarquias de herança sem uma necessidade concreta.

O domínio do mapa importa contratos e outros módulos de domínio diretamente. O `index.ts` oferece a API pública para consumidores externos; módulos internos não devem importá-lo, evitando ciclos. `utils/topology.ts` permanece como fachada de compatibilidade, incluindo os testes existentes. Novas funcionalidades devem usar os módulos em `features/topology`.

## Fluxo de monitoramento

1. `server.ts` prepara armazenamento e chave administrativa, configura e inicializa o serviço e inicia HTTP/WebSocket.
2. `MonitorService` limita sondagens simultâneas e compartilha o ciclo em andamento entre solicitações manuais.
3. A sondagem devolve resposta ICMP ou erro do coletor. Erro do coletor não entra como perda de pacote.
4. Gerações invalidam resultados iniciados antes de alterações do inventário. Horários inválidos ou atrasados também são recusados.
5. Domínio atualiza incidentes, amostras e tempo observado. Pausa, manutenção, DNS alterado e lacunas quebram continuidade conforme as regras existentes.
6. Snapshot expõe qualidade/idade dos dados e resultados separados dos serviços. HTTP e WebSocket entregam esse contrato ao frontend.

Configurações passam por `updateConfiguration`: operações são serializadas, gravadas antes da atualização do inventário e aguardam o ciclo relevante. Não altere `hosts` diretamente em uma rota. Não remova proteções de geração ao extrair novas classes.

## Fluxo de edição do mapa

1. `useTopology` carrega e reconcilia o documento com o inventário.
2. Gestos convertem coordenadas da tela em coordenadas do mundo; funções de domínio calculam seleção, rotas e encaixe em meia célula.
3. Comandos produzem um novo documento e chamam `commit`. Uma ação lógica deve gerar uma entrada de desfazer.
4. Componentes desenham o estado e delegam eventos aos hooks. Status pertence ao monitoramento; aparência pertence ao mapa.
5. Salvar usa a API administrativa e a revisão atual. Conflitos precisam ser mostrados ao operador, sem substituir silenciosamente o documento remoto.

Cópias de dispositivos são modelos visuais até um novo cadastro. O cadastro é uma operação de inventário, não uma operação reversível de desenho. O vínculo ao balão aguarda o novo dispositivo aparecer no snapshot.

## Onde implementar mudanças

| Mudança | Comece por | Verifique |
| --- | --- | --- |
| Forma, rota ou encaixe | `features/topology/domain` | `backend/tests/topology.test.ts` e edição no navegador |
| Mouse, touchpad ou atalhos | Hooks e `interaction/map-shortcuts.ts` | Testes de navegação e gesto físico |
| Campos visuais do mapa | Tipos, schema de topologia e componente específico | Salvar/recarregar documentos antigos e novos |
| Regra de incidente ou disponibilidade | `domain/monitoring` | Testes de monitoramento e confiabilidade |
| Novo serviço de sondagem | `service-check.service.ts`, contratos e schema | Tempo limite, destino autorizado e resultado separado do ICMP |
| Cadastro e manutenção | Schema, rotas de hosts e `DeviceForm` | CRUD, concorrência, segurança e persistência |
| Armazenamento | Repositório e `storage` | Migração, trava e atualização entre releases |

Tipos de frontend/backend são contratos locais que precisam evoluir juntos. Ao acrescentar campos persistidos, defina o comportamento quando estiverem ausentes em documentos antigos. Não torne o carregamento antigo equivalente à validação de novo cadastro: a apresentação mascara endereços legados sem apagar dados.

## Comentários e padrão de código

Use comentários de contrato nos módulos/classes e explique regras que não são óbvias: limite de observação, descarte de resultados, preservação de dobras, permissões e compatibilidade. Não descreva linha por linha o que a sintaxe já diz. Ao mudar uma regra, atualize o comentário e o teste correspondente.

Use nomes por responsabilidade, imports de tipos e dependências explícitas. Funções geométricas devem evitar efeitos colaterais; funções de edição produzem novos documentos. Separe um arquivo quando ele acumular responsabilidades, sem impor um limite artificial de linhas. Um orquestrador pode continuar maior que seus módulos de domínio.

`npm run format` aplica Prettier e `npm run format:check` verifica a padronização. ESLint verifica o frontend e TypeScript verifica os contratos dos dois projetos.

## Executar e validar

Na raiz, execute `npm ci`, `npm run lint`, `npm test`, `npm run build` e `npm run format:check`. `npm run dev` aguarda a saúde da API antes de abrir Vite; `npm start` usa o backend compilado e os arquivos de produção do frontend.

Os testes existentes cobrem geometria, persistência, CRUD, sequências de estados, erros do coletor, reinício, suspensão, dados antigos, segurança e serviços. Após mudanças de interação, confira no navegador seleção, arraste de grupo, junções, textos, salvar/recarregar, modo TV e touchpad. Testes automatizados não substituem essa conferência física.

## Operação e entrega

Os dados permanecem na pasta fixa indicada no terminal, por padrão `%LOCALAPPDATA%\PainelPing\data` no Windows. Preserve essa pasta e o `.env`; pare o processo antes de backup/restauração. Preferências visuais locais pertencem ao navegador. Nunca versione chave administrativa ou arquivos reais de inventário.

Alterações exigem chave administrativa desde a v1.10.1. Consultas continuam abertas a quem alcançar o backend; ocultar IPs em cards não restringe a API. Para administração pela rede, use HTTPS e controle de acesso à implantação. Consulte `docs/security-v1.10.1.md` para o escopo da revisão de segurança.

Uma release exige atualizar as versões dos workspaces/lockfile e adicionar `docs/releases/vX.Y.Z.md`. A CI valida Windows/Linux com Node 22/24 e só então publica o ZIP. Não reutilize uma tag existente. Para alterações estruturais, relate módulos extraídos, compatibilidade e validações realizadas, sem afirmar que toda dívida técnica foi eliminada.
