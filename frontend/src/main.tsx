import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import './index.css'
import App from './App'
import { LiveDataProvider } from './context/LiveData'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LiveDataProvider>
        <App />
      </LiveDataProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
