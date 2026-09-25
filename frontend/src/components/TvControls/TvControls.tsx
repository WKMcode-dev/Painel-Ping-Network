import { useEffect } from 'react'
import styles from './TvControls.module.css'
interface Props { tv: boolean; onToggle: () => void; group: string; groups: string[]; onGroup: (value: string) => void; seconds: number; paused: boolean }
export function TvControls({ tv, onToggle, group, groups, onGroup, seconds, paused }: Props) {
  const groupKey = JSON.stringify(groups)
  useEffect(() => {
    const rotationGroups: string[] = JSON.parse(groupKey)
    if (!tv || paused || seconds < 1 || !rotationGroups.length) return
    const timer = setInterval(() => onGroup(rotationGroups[(rotationGroups.indexOf(group) + 1) % rotationGroups.length]!), Math.max(5, seconds) * 1000)
    return () => clearInterval(timer)
  }, [tv, paused, seconds, group, groupKey, onGroup])
  return <div className={styles.bar}>
    <label>Setor <select value={group} onChange={e => onGroup(e.target.value)}><option value="">Todos os setores</option>{groups.map(g => <option key={g}>{g}</option>)}</select></label>
    <button type="button" onClick={onToggle}>{tv ? 'Sair do modo TV' : 'Modo TV / tela cheia'}</button>
    {tv && <span>Rotação {paused ? 'pausada enquanto há uma janela aberta' : seconds ? `a cada ${Math.max(5, seconds)} s` : 'desativada'} • problemas primeiro</span>}
  </div>
}
