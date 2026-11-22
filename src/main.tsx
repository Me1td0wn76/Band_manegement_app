import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './views/styles/tokens.css'
import './views/styles/riffboard.css'
import './views/styles/app.css'
import App from './App.tsx'
import { applyTheme } from './views/theme'

// 描画前にテーマを当てて、ちらつきを防ぐ
applyTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
