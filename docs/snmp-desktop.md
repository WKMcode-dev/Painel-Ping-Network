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

Distribuição inicial: Windows 10/11 x64 (NSIS) e Linux x64 com ambiente gráfico (AppImage e pacote DEB). A validação automatizada usa Windows e Ubuntu dos runners; outras versões/distribuições precisam de homologação. Linux precisa do comando `ping` e das bibliotecas gráficas do Electron. Não inclui atualização automática nem assinatura Authenticode.

O modo local inicia um processo auxiliar com o backend, acessível somente em loopback, e mantém o coletor na bandeja. **Encerrar** aguarda a gravação do histórico e a liberação da trava. Apenas uma instância pode escrever na pasta fixa de dados. Pare a versão web anterior antes de abrir o desktop. Dispositivos e mapa já salvos são reutilizados.

O `.env` do desktop fica no diretório de configuração do Electron: normalmente `%APPDATA%\PainelPingDesktop\.env` no Windows e `$XDG_CONFIG_HOME/PainelPingDesktop/.env` ou `~/.config/PainelPingDesktop/.env` no Linux. A pasta de dados continua `%LOCALAPPDATA%\PainelPing\data` / `~/.local/share/painel-ping/data`, salvo `DATA_DIR` absoluto. As preferências locais do navegador web não são migradas ao perfil do desktop. A porta local é reutilizada entre execuções; se estiver ocupada, uma nova porta é escolhida e as preferências daquela origem não se transferem.

Para usar um coletor independente, execute o aplicativo com `--server=https://origem-do-coletor` (sem caminho, usuário ou senha). Esse modo não inicia um backend local; a administração usa a chave do servidor. O coletor remoto deve ter sido iniciado e configurado separadamente. Encerrar ou desligar a máquina onde está o coletor local interrompe a observação; encapsular a aplicação não altera essa dependência.

## Desenvolvimento

`npm run desktop:dev` compila e abre o aplicativo. `npm run desktop:package` produz os pacotes da plataforma atual em `desktop-release`. A CI compila Windows e Linux e publica os três instaladores junto do ZIP de fontes. Dados de execução, `.env` e chaves não entram no pacote.

`snmp.service.ts` contém acesso UDP e perfis. `IncidentDiagnostics` contém regras determinísticas e confirmação. `IncidentRepository` contém persistência. `Incidents` apresenta registros sem sugestões genéricas. Ao acrescentar uma fonte, mantenha essa separação e preserve a distinção entre evidência, estado e causa.
