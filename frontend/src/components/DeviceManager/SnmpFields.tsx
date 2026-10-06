import { useState } from 'react'
import type { DeviceConfig } from '../../types/config'
interface Props {
  device: DeviceConfig
  devices: DeviceConfig[]
  change: <K extends keyof DeviceConfig>(key: K, value: DeviceConfig[K]) => void
}
/** Só referências públicas; comunidade/senhas permanecem no ambiente do coletor. */
export function SnmpFields({ device, devices, change }: Props) {
  const [indices, setIndices] = useState(device.snmp?.interfaces.join(', ') ?? '')
  const parent = devices.find((item) => item.id === device.attachment?.hostId)
  return (
    <>
      <fieldset>
        <legend>SNMP</legend>
        <label>
          <input
            type="checkbox"
            checked={Boolean(device.snmp)}
            onChange={(e) => {
              setIndices('')
              change(
                'snmp',
                e.target.checked ? { profile: '', port: 161, interfaces: [] } : undefined,
              )
            }}
          />{' '}
          Consultar este equipamento por SNMP
        </label>
        {device.snmp && (
          <>
            <label>
              Perfil do coletor
              <input
                required
                pattern="[A-Z][A-Z0-9_]{0,39}"
                maxLength={40}
                value={device.snmp.profile}
                onChange={(e) =>
                  change('snmp', { ...device.snmp!, profile: e.target.value.toUpperCase() })
                }
              />
            </label>
            <label>
              Porta UDP
              <input
                required
                type="number"
                min={1}
                max={65535}
                value={device.snmp.port}
                onChange={(e) => change('snmp', { ...device.snmp!, port: Number(e.target.value) })}
              />
            </label>
            <label>
              Índices das interfaces
              <input
                pattern="[0-9]+(\s*,\s*[0-9]+)*"
                value={indices}
                placeholder="1, 2, 24"
                onChange={(e) => {
                  setIndices(e.target.value)
                  change('snmp', {
                    ...device.snmp!,
                    interfaces: e.target.value
                      .split(',')
                      .filter((v) => v.trim())
                      .map(Number),
                  })
                }}
              />
            </label>
          </>
        )}
      </fieldset>
      <fieldset>
        <legend>Porta de acesso</legend>
        <label>
          Equipamento
          <select
            value={device.attachment?.hostId ?? ''}
            onChange={(e) => {
              const next = devices.find((item) => item.id === e.target.value)
              change(
                'attachment',
                next ? { hostId: next.id, interfaceIndex: next.snmp!.interfaces[0]! } : undefined,
              )
            }}
          >
            <option value="">Sem vínculo</option>
            {devices
              .filter((item) => item.id !== device.id && item.snmp?.interfaces.length)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        {device.attachment && (
          <label>
            Interface
            <select
              required
              value={device.attachment.interfaceIndex}
              onChange={(e) =>
                change('attachment', {
                  ...device.attachment!,
                  interfaceIndex: Number(e.target.value),
                })
              }
            >
              {parent?.snmp?.interfaces.map((index) => (
                <option key={index} value={index}>
                  {index}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>
    </>
  )
}
