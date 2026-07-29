import './polyfills'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ThemeProvider } from './infra/theme/ThemeContext'
import { I18nProvider } from './infra/locales/I18nContext'
import ComponentInspector from './infra/devtools/ComponentInspector'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <I18nProvider>
          <App />
        </I18nProvider>
      </ThemeProvider>
    </BrowserRouter>
    {import.meta.env.DEV && <ComponentInspector />}
  </React.StrictMode>
)
