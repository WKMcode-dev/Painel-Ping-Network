# 📡 Painel Ping

Painel web para acompanhar a disponibilidade de dispositivos de rede por ICMP. O backend executa as verificações, reconhece quedas e retornos e envia os dados ao frontend em tempo real por WebSocket.

## O que já está disponível

- status **on-line**, **off-line** ou **verificando**;
- latência atual, média, mínima e máxima;
- perda de pacotes e percentual de disponibilidade da janela atual;
- TTL da última resposta;
- horário da última verificação, queda, retorno e transição;
- duração ao vivo de incidentes ativos;
- histórico persistente de quedas e recuperações por 30 dias;
- busca por nome, IP, local ou grupo e filtro por status;
- atualização automática e manual;
- modo tela cheia, layout responsivo e grade densa para TV;
- aviso de desconexão sem introduzir dados fictícios; último resultado identificado como desatualizado.

## Arquitetura

```text
Painel Ping/
├── frontend/                 # React + TypeScript + Vite
│   └── src/
│       ├── app/              # composição da aplicação
│       ├── components/       # componentes com estilos isolados
│       ├── hooks/            # estado e conexão do monitoramento
│       ├── services/         # API HTTP e WebSocket
│       ├── types/            # contratos do frontend
│       └── utils/            # formatação e utilidades
├── backend/                  # Node.js + Express + TypeScript
│   └── src/
│       ├── config/           # ambiente e lista de hosts
│       ├── controllers/      # controladores HTTP
│       ├── repositories/     # persistência do histórico
│       ├── routes/           # rotas da API
│       ├── services/         # ping e regras de monitoramento
│       ├── types/            # contratos do backend
│       ├── utils/            # validação segura de endereços
│       └── websocket/        # atualizações em tempo real
└── .env.example              # configuração documentada
```

## Executar em desenvolvimento

Requer Node.js 22.12 ou superior (Node 24 recomendado) e o utilitário `ping` disponível no sistema.

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`. O backend usa `http://localhost:3333` e o Vite encaminha API e WebSocket automaticamente.

## Cadastrar os endereços reais

Use **Configurações → Dispositivos e monitoramento** para adicionar, editar, pausar e remover hosts, organizar setores e agendar manutenção. Clique em **Salvar cadastro e regras**. Os dados ficam em `backend/storage/config.json`, fora do Git. Faça backup da pasta `backend/storage` ao atualizar.

O arquivo `backend/src/config/hosts.ts` fornece somente os exemplos iniciais quando ainda não existe configuração salva. Cada item possui:

```ts
{
  id: 'gateway-garagem-norte', // identificador único e estável
  name: 'Gateway Garagem Norte',
  address: '172.20.21.138',    // IPv4, IPv6 ou hostname
  location: 'Garagem Norte',
  group: 'Gateways',
  description: 'Link principal da unidade',
}
```

O editor mantém o ID ao editar um dispositivo. A troca de endereço encerra administrativamente um incidente aberto e reinicia as métricas, preservando o histórico. Remover um dispositivo não apaga imediatamente os eventos retidos; um novo cadastro recebe outro ID.

## Configuração

Copie `.env.example` para `.env` e ajuste quando necessário:

| Variável | Padrão | Função |
| --- | ---: | --- |
| `PORT` | `3333` | Porta HTTP e WebSocket |
| `PING_INTERVAL_MS` | `5000` | Intervalo entre ciclos |
| `PING_TIMEOUT_MS` | `1500` | Tempo máximo de cada resposta |
| `FAILURE_THRESHOLD` | `2` | Valor inicial; depois prevalece a regra salva nas configurações |
| `HISTORY_LIMIT` | `120` | Pontos recentes mantidos por host |
| `DATA_RETENTION_DAYS` | `30` | Retenção de eventos persistidos |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Origens permitidas, separadas por vírgula |

Usar duas falhas consecutivas reduz alarmes falsos causados por perda isolada de ICMP.

## Produção na rede local

```bash
npm run build
```

No Linux/macOS:

```bash
NODE_ENV=production npm start
```

No PowerShell:

```powershell
$env:NODE_ENV = "production"
npm start
```

Depois, abra `http://IP-DO-COMPUTADOR:3333` na TV. O computador que executa o backend precisa permanecer ligado e ter acesso às redes monitoradas. Libere a porta 3333 no Firewall do Windows apenas para a rede corporativa.

## Observação sobre ICMP

O navegador não consegue disparar ping ICMP diretamente. Por isso, o frontend apenas exibe os resultados, enquanto o backend roda dentro da rede corporativa e realiza as verificações. Alguns equipamentos bloqueiam ICMP mesmo estando ativos; nesses casos, uma próxima evolução pode combinar ping com testes TCP/HTTP específicos.


## Versão 1.1.0

- Tema claro padrão na primeira abertura.
- Tema escuro disponível pelo botão de engrenagem no cabeçalho.
- Configurações com versão da aplicação e preferência de tema salva neste navegador.
- Seleção de IPs continua no arquivo de configuração existente.

## Versão 1.2.0

Correções de confiabilidade de ICMP, reconexão, concorrência e histórico. Veja [a revisão e os próximos passos](docs/REVISAO-1.2.0.md).

```bash
npm ci
npm run lint
npm test
npm run build
```

GitHub Actions verifica Windows/Linux com Node 22/24 em pushes e pull requests. As medições são executadas no computador do backend, que precisa alcançar os dispositivos monitorados. O endpoint de saúde indica processo acessível, não disponibilidade de todos os hosts.

`MAX_CONCURRENT_PINGS=8` limita os processos simultâneos. Os ciclos não se sobrepõem; com muitos hosts ou latência alta, o intervalo efetivo pode aumentar.

### Certificados da rede corporativa

Se aparecer `SELF_SIGNED_CERT_IN_CHAIN`, configure a CA corporativa confiável. Em Node recente no PowerShell, pode ser necessário usar `$env:NODE_OPTIONS = "--use-system-ca"` antes de `npm ci`. Não desative a validação TLS. O log de proxy `ECONNREFUSED` pode aparecer durante a inicialização; a interface aguarda e tenta novamente.

### Licença

Nenhuma licença de redistribuição foi escolhida nesta versão. A publicação pública não concede automaticamente licença de uso.

## Versão 1.3.0 — Aparência

Paleta inspirada no Notion em claro/escuro. Em Configurações → Cores, escolha entre nove destaques predefinidos ou personalize destaque, on-line, off-line, avisos, fundo e cartões com seletor e HEX. Preferências independentes por tema são salvas neste navegador. Restaurar paleta afeta apenas o tema ativo. Cores arbitrárias podem diminuir a distinção entre estados; os rótulos continuam visíveis.


## Versão 1.4.0 — Operação do painel

- Cadastro persistente de até 200 dispositivos, IPv4/IPv6/hostname, nome, setor e local; pausa e remoção pela interface.
- Seleção de dispositivos por navegador: ocultar da TV não interrompe a coleta. O resumo considera todos os dispositivos; a grade aplica a seleção e os filtros.
- Confirmações configuráveis de queda e retorno (1–20 amostras consecutivas). Erros do coletor são desconhecidos, não perdas de pacotes.
- Cartões e detalhes mostram **Sem atualização** quando desconectados ou sem amostra há mais de `max(30 segundos, 3 × intervalo)`. O resumo também deixa de contar esses hosts como on-line/off-line.
- Histórico individual com início, fim e duração, além da sequência de eventos. Retenção padrão de 30 dias, limitada a 5.000 eventos globais. Métricas de amostras permanecem na memória durante a execução.
- Modo TV com tela cheia, nomes maiores, ordenação por problemas e rotação de setores. Configure 0 para não girar; intervalos positivos têm mínimo efetivo de 5 segundos. Janelas de detalhes/configurações pausam a rotação. Busca e filtro de status continuam sendo aplicados.
- Alertas visuais e som opcionais neste navegador, apenas para eventos novos dos hosts selecionados. Ative o áudio por clique, conforme a política do navegador. Silenciar dura 15 minutos; dispensar limpa os avisos. Eventos anteriores à abertura, administrativos e com mais de um minuto não disparam alertas. Não envia e-mail, WhatsApp ou notificações externas.
- Manutenção com início/fim no horário local do operador, armazenados em UTC. Durante manutenção/pausa, não há sondagens nem novos incidentes. Incidentes já abertos são encerrados administrativamente, sem fingir um retorno. Após a janela, a coleta retoma no próximo ciclo e exige novas confirmações.

A API de configuração (`GET/PUT /api/monitor/config`) usa JSON validado e gravação por arquivo temporário + renomeação. Alterações de cadastro aguardam sondagens em andamento. Não existe login/perfil de administrador nesta versão: instale em rede confiável com acesso controlado; quem alcança o backend pode administrar o cadastro. Para frontend em outra origem, configure `ALLOWED_ORIGINS`.

Atualização: preserve `backend/storage` e `.env`, atualize os arquivos do projeto, execute `npm install` e reinicie com `npm run dev` (ou `npm run build` e `npm start` em produção). Preferências de aparência, TV e alertas são locais ao navegador e ao endereço de acesso.

### Verificação

`npm test` cobre o parser Windows/Linux, sequências combinatórias de estados, confirmações, persistência, CRUD, manutenção, pausa, concorrência, validação HTTP, dados desatualizados e deduplicação de alertas. `npm run build` e `npm run lint` validam os dois projetos.

### Próxima etapa

Visualização de topologia em mapa de rede com nós flutuantes e conexões. Não faz parte da v1.4.0; o painel de cartões continua sendo a visualização desta versão.
