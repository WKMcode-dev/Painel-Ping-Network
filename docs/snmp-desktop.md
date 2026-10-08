# Configuração técnica — SNMP e desktop

## Coletor

Os perfis SNMP são variáveis privadas, carregadas do ambiente ou `.env` ao iniciar. O cadastro e a API recebem apenas `profile`, porta UDP e índices de interfaces; comunidade e senhas não são armazenadas no inventário. Recomenda-se SNMPv3 authPriv; esta versão suporta SHA/SHA-256 com AES-128 e SNMPv2c para compatibilidade.

```dotenv
SNMP_PROFILE_REDE='{"version":"3","username":"monitor","authPassword":"ALTERE_A_SENHA","privPassword":"ALTERE_A_SENHA","authProtocol":"sha256"}'
```

Substitua usuário e senhas pelos valores configurados no equipamento. Para v2c, o perfil usa `{"version":"2c","community":"ALTERE_A_COMUNIDADE"}`. Reinicie o coletor após modificar o ambiente. Restrinja o acesso de leitura SNMP ao endereço do coletor no equipamento e libere a porta UDP configurada.

No cadastro do switch/roteador, habilite SNMP, informe `REDE`, porta UDP (normalmente 161) e os `ifIndex` desejados, até 32 por equipamento. `ifIndex` precisa ser obtido do equipamento: não se presume correspondência com o número impresso da porta. No dispositivo conectado, selecione esse equipamento e a interface em **Porta de acesso**. As ligações desenhadas no mapa não são usadas como evidência física.

São consultados `sysUpTime`, `ifDescr`, `ifAdminStatus` e `ifOperStatus` da IF-MIB. Não são enviados comandos SET. Falhas de perfil, autenticação ou resposta deixam SNMP **desconhecido**; não comprovam queda do dispositivo. A sondagem tem limite total de seis segundos e reutiliza a concorrência do coletor.

## Incidentes

ICMP segue os limiares existentes. Falhas TCP/HTTP e estados de interface são confirmados após amostras consecutivas distintas, usando `failureThreshold`. O acesso associado pode acrescentar evidência à queda ICMP. A causa administrativa é apresentada somente quando `ifAdminStatus=down` é observado na interface cadastrada. `ifOperStatus=down/lowerLayerDown` informa o estado operacional; não determina a causa física.

Os registros persistem em `incident-reports.json`, com retenção dos encerrados de `DATA_RETENTION_DAYS` e limite de 5.000 registros. Reinício, pausa, remoção ou dados antigos interrompem continuidade; não são apresentados como recuperação. A duração de registros interrompidos permanece desconhecida. Nesta entrega não há receptor de traps, ingestão de Syslog ou interpretação de eventos específicos de fabricantes. Portanto, não há promessa de determinar a causa física exata de toda desconexão nem de observar eventos breves entre sondagens.

## Desktop

Distribuição Tauri 2/Rust: Windows 10/11 x64 (NSIS), Linux x64 com ambiente gráfico (AppImage/DEB). O coletor permanece em Node/TypeScript, com runtime incluído; o usuário não precisa instalar Node/npm. Windows usa WebView2; o instalador disponibiliza o bootstrapper quando necessário. Linux requer WebKitGTK 4.1, GTK3, suporte à bandeja e o comando `ping`. AppImage depende de FUSE ou extração. Windows 7 não é suportado nesta entrega. A CI usa Windows/Ubuntu dos runners; outras distribuições exigem homologação. Não inclui atualização automática nem assinatura Authenticode.

O modo local inicia um processo auxiliar com o backend, acessível somente em loopback, e mantém o coletor na bandeja. **Encerrar** aguarda a gravação do histórico e a liberação da trava. Apenas uma instância pode escrever na pasta fixa de dados. Pare a versão web anterior antes de abrir o desktop. Dispositivos e mapa já salvos são reutilizados.

O `.env` do desktop fica no diretório estável de configuração do desktop: normalmente `%APPDATA%\PainelPingDesktop\.env` no Windows e `$XDG_CONFIG_HOME/PainelPingDesktop/.env` ou `~/.config/PainelPingDesktop/.env` no Linux. A pasta de dados continua `%LOCALAPPDATA%\PainelPing\data` / `~/.local/share/painel-ping/data`, salvo `DATA_DIR` absoluto. A migração reutiliza inventário, mapa salvo, histórico, chave e configuração SNMP. Tema, zoom e outras preferências locais do navegador podem precisar ser ajustados novamente porque o motor mudou. A porta local é reutilizada entre execuções; se estiver ocupada, uma nova porta é escolhida e as preferências daquela origem não se transferem.

Para usar um coletor independente, execute o aplicativo com `--server=https://origem-do-coletor` (sem caminho, usuário ou senha). Esse modo não inicia um backend local; a administração usa a chave do servidor. O coletor remoto deve ter sido iniciado e configurado separadamente. Encerrar ou desligar a máquina onde está o coletor local interrompe a observação; encapsular a aplicação não altera essa dependência.

## Desenvolvimento

`npm run desktop:dev` compila e abre o aplicativo. Desenvolvimento exige Rust/Cargo e os pré-requisitos nativos do Tauri: MSVC no Windows; WebKitGTK 4.1/GTK3/AppIndicator no Linux. `npm run desktop:package -- --bundles nsis` no Windows ou `--bundles deb,appimage` no Linux gera os pacotes em `src-tauri/target/release/bundle`. A CI compila Windows e Linux e publica os três instaladores junto do ZIP de fontes. Dados de execução, `.env` e chaves não entram no pacote.

`snmp.service.ts` contém acesso UDP e perfis. `IncidentDiagnostics` contém regras determinísticas e confirmação. `IncidentRepository` contém persistência. `Incidents` apresenta registros sem sugestões genéricas. Ao acrescentar uma fonte, mantenha essa separação e preserve a distinção entre evidência, estado e causa.


## Organização do desktop

`src-tauri/src/runtime.rs` controla processo filho, loopback, saúde e encerramento com flush via stdin privado. EOF também encerra o coletor quando o desktop desaparece. `admin.rs` limita chave/clipboard à janela local `admin-key`; páginas HTTP não têm essa permissão. A instância de clipboard é conservada para suportar a seleção X11. `main.rs` compõe janela, menu, bandeja e instância única. `desktop/stage.mjs` empacota apenas código, dependências e runtime; dados e credenciais ficam fora da instalação. A fonte única `frontend/public/favicon.svg` gera todos os ícones na etapa de preparação.

O pulso do mapa segue curvas e dobras, pode ser desativado e respeita movimento reduzido. É decorativo e não mede tráfego real.
