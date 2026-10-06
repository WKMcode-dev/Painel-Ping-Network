import { ListChecks, LayoutGrid, Network, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import styles from './Sidebar.module.css'

export type DashboardView = 'cards' | 'map' | 'incidents'

export function Sidebar({
  view,
  onView,
  collapsed,
  onToggle,
}: {
  view: DashboardView
  onView: (view: DashboardView) => void
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <aside className={styles.sidebar} data-collapsed={collapsed} aria-label="Menu de visualizações">
      <div className={styles.top}>
        <span>{!collapsed && 'Visualizações'}</span>
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
        </button>
      </div>
      <nav aria-label="Visualizações do painel">
        <button
          type="button"
          className={styles.item}
          data-active={view === 'cards'}
          aria-current={view === 'cards' ? 'page' : undefined}
          aria-label="Cartões"
          title="Cartões"
          onClick={() => onView('cards')}
        >
          <LayoutGrid size={19} />
          <span>Cartões</span>
        </button>
        <button
          type="button"
          className={styles.item}
          data-active={view === 'map'}
          aria-current={view === 'map' ? 'page' : undefined}
          aria-label="Mapa"
          title="Mapa"
          onClick={() => onView('map')}
        >
          <Network size={19} />
          <span>Mapa</span>
        </button>
        <button
          type="button"
          className={styles.item}
          data-active={view === 'incidents'}
          aria-current={view === 'incidents' ? 'page' : undefined}
          aria-label="Incidentes"
          title="Incidentes"
          onClick={() => onView('incidents')}
        >
          <ListChecks size={19} />
          <span>Incidentes</span>
        </button>
      </nav>
    </aside>
  )
}
