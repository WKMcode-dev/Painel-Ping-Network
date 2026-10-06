import { SnmpFields } from './SnmpFields'
import type { DeviceConfig, PanelPreferences } from '../../types/config'
import type { ServiceCheck } from '../../types/monitor'
import styles from './DeviceManager.module.css'
const localDate = (value?: string | null) =>
  value
    ? new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : ''
const utcDate = (value: string) => (value ? new Date(value).toISOString() : null)
interface Props {
  devices: DeviceConfig[]
  editing: DeviceConfig
  busy: boolean
  preferences: PanelPreferences
  onPreferences: (value: PanelPreferences) => void
  change: <K extends keyof DeviceConfig>(key: K, value: DeviceConfig[K]) => void
  onSave: () => Promise<void>
  onReset: () => void
}
/** Formulário controlado: salvar/remover e confirmação de descarte pertencem ao gerenciador. */
export function DeviceForm({
  editing,
  devices,
  busy,
  preferences,
  onPreferences,
  change,
  onSave,
  onReset,
}: Props) {
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        void onSave()
      }}
    >
      <h3>{editing.id ? `Editar ${editing.name}` : 'Novo dispositivo'}</h3>
      <label>
        Nome
        <input
          required
          maxLength={100}
          value={editing.name}
          onChange={(event) => change('name', event.target.value)}
        />
      </label>
      <label>
        IP ou hostname
        <input
          required
          maxLength={253}
          value={editing.address}
          onChange={(event) => change('address', event.target.value)}
        />
      </label>
      <label>
        Setor
        <input
          required
          maxLength={100}
          value={editing.group}
          onChange={(event) => change('group', event.target.value)}
        />
      </label>
      <label>
        Local
        <input
          maxLength={100}
          value={editing.location}
          onChange={(event) => change('location', event.target.value)}
        />
      </label>
      <label>
        Descrição
        <textarea
          maxLength={500}
          value={editing.description ?? ''}
          onChange={(event) => change('description', event.target.value)}
        />
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={editing.enabled}
          onChange={(event) => change('enabled', event.target.checked)}
        />{' '}
        Monitoramento ativo
      </label>
      {editing.id && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={!preferences.hidden.includes(editing.id)}
            onChange={(event) =>
              onPreferences({
                ...preferences,
                hidden: event.target.checked
                  ? preferences.hidden.filter((id) => id !== editing.id)
                  : [...preferences.hidden, editing.id],
              })
            }
          />{' '}
          Exibir neste painel / TV
        </label>
      )}
      <fieldset>
        <legend>Verificações de serviços (opcionais)</legend>
        <p>
          ICMP e serviços têm resultados separados. HTTP verifica a URL informada, sem seguir
          redirecionamentos.
        </p>
        {(editing.checks ?? []).map((check, index) => (
          <fieldset key={check.id}>
            <legend>Serviço {index + 1}</legend>
            <label>
              Tipo
              <select
                value={check.type}
                onChange={(event) =>
                  change(
                    'checks',
                    editing.checks!.map((item) =>
                      item.id === check.id
                        ? {
                            id: item.id,
                            type: event.target.value as ServiceCheck['type'],
                            ...(event.target.value === 'tcp'
                              ? { port: 443 }
                              : { url: `http://${editing.address}/` }),
                          }
                        : item,
                    ),
                  )
                }
              >
                <option value="tcp">TCP</option>
                <option value="http">HTTP</option>
              </select>
            </label>
            {check.type === 'tcp' ? (
              <label>
                Porta
                <input
                  required
                  type="number"
                  min={1}
                  max={65535}
                  value={check.port ?? ''}
                  onChange={(event) =>
                    change(
                      'checks',
                      editing.checks!.map((item) =>
                        item.id === check.id ? { ...item, port: Number(event.target.value) } : item,
                      ),
                    )
                  }
                />
              </label>
            ) : (
              <>
                <label>
                  URL
                  <input
                    required
                    type="url"
                    value={check.url ?? ''}
                    onChange={(event) =>
                      change(
                        'checks',
                        editing.checks!.map((item) =>
                          item.id === check.id ? { ...item, url: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Status esperado (vazio: 200–399)
                  <input
                    type="number"
                    min={100}
                    max={599}
                    value={check.expectedStatus ?? ''}
                    onChange={(event) =>
                      change(
                        'checks',
                        editing.checks!.map((item) =>
                          item.id === check.id
                            ? {
                                ...item,
                                expectedStatus: event.target.value
                                  ? Number(event.target.value)
                                  : undefined,
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
              </>
            )}
            <button
              type="button"
              onClick={() =>
                change(
                  'checks',
                  editing.checks!.filter((item) => item.id !== check.id),
                )
              }
            >
              Remover serviço
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={(editing.checks?.length ?? 0) >= 8}
          onClick={() =>
            change('checks', [
              ...(editing.checks ?? []),
              { id: crypto.randomUUID(), type: 'tcp', port: 443 },
            ])
          }
        >
          Adicionar serviço
        </button>
      </fieldset>
      <SnmpFields key={editing.id} device={editing} devices={devices} change={change} />
      <label>
        Início da manutenção
        <input
          type="datetime-local"
          value={localDate(editing.maintenanceStart)}
          onChange={(event) => change('maintenanceStart', utcDate(event.target.value))}
        />
      </label>
      <label>
        Fim da manutenção
        <input
          type="datetime-local"
          value={localDate(editing.maintenanceEnd)}
          onChange={(event) => change('maintenanceEnd', utcDate(event.target.value))}
        />
      </label>
      <div className={styles.rowActions}>
        <button
          type="button"
          onClick={() => {
            change('maintenanceStart', null)
            change('maintenanceEnd', null)
          }}
        >
          Limpar manutenção
        </button>
        <button type="submit" disabled={busy}>
          {busy ? 'Salvando…' : editing.id ? 'Salvar alterações' : 'Adicionar dispositivo'}
        </button>
        <button type="button" onClick={() => onReset()} disabled={busy}>
          Limpar formulário
        </button>
      </div>
    </form>
  )
}
