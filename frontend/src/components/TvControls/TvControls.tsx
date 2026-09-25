import { useEffect, useState } from 'react'
import styles from './TvControls.module.css'
interface Props { tv: boolean; onTv: (value: boolean) => void; group: string; groups: string[]; onGroup: (value: string) => void; seconds: number; paused: boolean }
export function TvControls({ tv, onTv, group, groups, onGroup, seconds, paused }: Props) {
  const [error, setError] = useState('')
  const groupKey = JSON.stringify(groups)
  useEffect(() => {
    const rotationGroups: string[] = JSON.parse(groupKey)
    if (!tv || paused || seconds < 1 || !rotationGroups.length) return
    const timer = setInterval(() => onGroup(rotationGroups[(rotationGroups.indexOf(group) + 1) % rotationGroups.length]!), Math.max(5, seconds) * 1000)
    return () => clearInterval(timer)
  }, [tv, paused, seconds, group, groupKey, onGroup])
  const toggle = async () => {
    setError('')
    onTv(!tv)
    try {
      if (!tv && !document.fullscreenElement) await document.documentElement.requestFullscreen()
      else if (tv && document.fullscreenElement) await document.exitFullscreen()
    } catch { setError('Tela cheia indisponível; o layout de TV continua ativo.') }
  }
  return <div className={styles.bar}>
    <label>Setor <select value={group} onChange={e => onGroup(e.target.value)}><option value="">Todos os setores</option>{groups.map(g => <option key={g}>{g}</option>)}</select></label>
    <button type="button" onClick={() => void toggle()}>{tv ? 'Sair do modo TV' : 'Modo TV / tela cheia'}</button>
    {tv && <span>Rotação {paused ? 'pausada enquanto há uma janela aberta' : seconds ? `a cada ${Math.max(5, seconds)} s` : 'desativada'} • problemas primeiro</span>}
    {error && <span role="status">{error}</span>}
  </div>
}
