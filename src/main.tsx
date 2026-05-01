import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

console.log('Renderer process started');

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<App />);
} else {
  console.error('Root element not found');
}

// Use contextBridge
if (window.ipcRenderer) {
  window.ipcRenderer.on('main-process-message', (_event, message) => {
    console.log('Main process message:', message)
  })
}
