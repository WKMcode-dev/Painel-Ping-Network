import type { HostDefinition } from '../types/monitor.js'

/**
 * Dispositivos monitorados. Substitua os exemplos pelos endereços da sua rede.
 * O ID deve permanecer estável para preservar o histórico do dispositivo.
 */
export const monitoredHosts: HostDefinition[] = [
  {
    id: 'gateway-principal',
    name: 'Este computador (loopback)',
    address: '127.0.0.1',
    location: 'Datacenter',
    group: 'Infraestrutura',
    description: 'Exemplo local; substitua pelo endereço real do gateway' ,
  },
  {
    id: 'dns-cloudflare',
    name: 'DNS Cloudflare',
    address: '1.1.1.1',
    location: 'Internet',
    group: 'Serviços externos',
    description: 'Referência externa para disponibilidade da internet',
  },
  {
    id: 'dns-google',
    name: 'DNS Google',
    address: '8.8.8.8',
    location: 'Internet',
    group: 'Serviços externos',
    description: 'Segunda referência externa para disponibilidade',
  },
]
