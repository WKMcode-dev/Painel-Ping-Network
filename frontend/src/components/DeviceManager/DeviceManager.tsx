import { DeviceForm } from './DeviceForm'
import { useEffect, useMemo, useRef, useState } from 'react'
import { privateLabel } from '../../utils/privacy'
import { Plus, Search, X } from 'lucide-react'
import type { DeviceConfig, PanelPreferences } from '../../types/config'
import type { HostSnapshot } from '../../types/monitor'
import {
  configurationRequest,
  createDevice,
  editDevice,
  removeDevice,
} from '../../services/monitor-api'
import styles from './DeviceManager.module.css'

const empty = (): DeviceConfig => ({
  id: '',
  name: '',
  address: '',
  group: 'Geral',
  location: '',
  description: '',
  enabled: true,
  maintenanceStart: null,
  maintenanceEnd: null,
})
export function DeviceManager({
  open,
  onClose,
  hosts,
  preferences,
  onPreferences,
}: {
  open: boolean
  onClose: () => void
  hosts: HostSnapshot[]
  preferences: PanelPreferences
  onPreferences: (value: PanelPreferences) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [devices, setDevices] = useState<DeviceConfig[]>([])
  const [editing, setEditing] = useState<DeviceConfig | null>(null)
  const [original, setOriginal] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const dirty = editing && JSON.stringify(editing) !== original
  const refresh = async () => {
    setBusy(true)
    setError('')
    try {
      setDevices((await configurationRequest()).hosts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível listar os dispositivos')
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (open && !dialog.current?.open) {
      dialog.current?.showModal()
      void refresh()
    }
    if (!open && dialog.current?.open) dialog.current.close()
  }, [open])
  const requestClose = () => {
    if (dirty && !window.confirm('Descartar as alterações deste formulário?')) return
    onClose()
  }
  const begin = (device: DeviceConfig) => {
    if (dirty && !window.confirm('Descartar as alterações deste formulário?')) return
    setEditing({ ...device })
    setOriginal(JSON.stringify(device))
    setError('')
    setMessage('')
  }
  const save = async () => {
    if (!editing || busy) return
    if (
      [editing.name, editing.group, editing.location, editing.description ?? ''].some(
        (text) => privateLabel(text) !== text,
      )
    ) {
      setError('Use IPs somente no campo IP ou hostname, nunca nos campos de texto.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { id, ...data } = editing
      const result = id ? await editDevice(id, data) : await createDevice(data)
      setDevices((list) =>
        id ? list.map((item) => (item.id === id ? result : item)) : [...list, result],
      )
      setEditing(null)
      setOriginal('')
      setMessage(id ? 'Dispositivo atualizado.' : 'Dispositivo adicionado ao monitoramento.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setBusy(false)
    }
  }
  const remove = async (device: DeviceConfig) => {
    if (
      !window.confirm(
        `Remover “${device.name}” do monitoramento? O histórico permanece até expirar o período de retenção.`,
      )
    )
      return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await removeDevice(device.id)
      setDevices((list) => list.filter((item) => item.id !== device.id))
      setEditing((current) => (current?.id === device.id ? null : current))
      onPreferences({ ...preferences, hidden: preferences.hidden.filter((id) => id !== device.id) })
      setMessage('Dispositivo removido.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao remover')
    } finally {
      setBusy(false)
    }
  }
  const change = <K extends keyof DeviceConfig>(key: K, value: DeviceConfig[K]) =>
    setEditing((previous) => (previous ? { ...previous, [key]: value } : null))
  const visible = useMemo(
    () =>
      devices
        .filter((item) =>
          `${item.name} ${item.address} ${item.group} ${item.location}`
            .toLocaleLowerCase('pt-BR')
            .includes(query.trim().toLocaleLowerCase('pt-BR')),
        )
        .sort(
          (a, b) =>
            a.group.localeCompare(b.group, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'),
        ),
    [devices, query],
  )
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="devices-title"
      onCancel={(event) => {
        event.preventDefault()
        requestClose()
      }}
      onClose={onClose}
    >
      <header className={styles.header}>
        <div>
          <h2 id="devices-title">Dispositivos da rede</h2>
          <p>Cadastre, consulte, edite e remova endereços monitorados.</p>
        </div>
        <button type="button" aria-label="Fechar dispositivos" onClick={requestClose}>
          <X size={20} />
        </button>
      </header>
      <div className={styles.content}>
        <div className={styles.toolbar}>
          <label>
            <Search size={16} />
            <input
              aria-label="Buscar dispositivo"
              placeholder="Buscar nome, endereço, setor ou local"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button disabled={busy} onClick={() => begin(empty())}>
            <Plus size={16} /> Novo dispositivo
          </button>
          <button disabled={busy} onClick={() => void refresh()}>
            Atualizar lista
          </button>
        </div>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <div className={styles.layout}>
          <div className={styles.list} aria-label="Dispositivos cadastrados">
            {visible.map((device) => {
              const live = hosts.find((host) => host.id === device.id)
              return (
                <article key={device.id} className={styles.row}>
                  <div>
                    <strong>{device.name}</strong>
                    <small>
                      {device.address} · {device.group} ·{' '}
                      {live?.suspended ??
                        (live?.status === 'online'
                          ? 'On-line'
                          : live?.status === 'offline'
                            ? 'Off-line'
                            : 'Verificando')}
                    </small>
                  </div>
                  <div className={styles.rowActions}>
                    <button type="button" onClick={() => begin(device)} disabled={busy}>
                      Editar
                    </button>
                    <button type="button" onClick={() => void remove(device)} disabled={busy}>
                      Remover
                    </button>
                  </div>
                </article>
              )
            })}
            {!visible.length && (
              <p>
                {devices.length
                  ? 'Nenhum dispositivo encontrado.'
                  : 'Nenhum dispositivo cadastrado.'}
              </p>
            )}
          </div>
          {editing && (
            <DeviceForm
              editing={editing}
              busy={busy}
              preferences={preferences}
              onPreferences={onPreferences}
              change={change}
              onSave={save}
              onReset={() => begin(empty())}
            />
          )}
        </div>
      </div>
    </dialog>
  )
}
