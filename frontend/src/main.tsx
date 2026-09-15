import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './index.css'
import { applyAppearance, loadColors } from './theme/palette'

const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
applyAppearance(theme, loadColors()[theme])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
