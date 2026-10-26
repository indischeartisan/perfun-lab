import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'

if (import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
  void import('./layoutDebug')
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
