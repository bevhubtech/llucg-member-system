import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
        return (
          <div style={{ padding: '2rem', background: '#0f172a', color: '#f1f5f9', fontFamily: 'sans-serif', minHeight: '100vh' }}>
            <h1 style={{ color: '#ef4444' }}>Critical Frontend Error</h1>
            <p>The system encountered a runtime crash. This often happens due to stale session data or a component error.</p>
            <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '8px', overflow: 'auto', marginBottom: '1rem', border: '1px solid #334155' }}>
              <pre style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{this.state.error?.stack || this.state.error?.toString()}</pre>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
                <button onClick={() => window.location.reload()} style={{ padding: '0.75rem 1.5rem', background: '#6366f1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Reload Page
                </button>
                <button onClick={() => { localStorage.clear(); window.location.href = '/login'; }} style={{ padding: '0.75rem 1.5rem', background: '#334155', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    Clear Cache & Logout
                </button>
            </div>
          </div>
        );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
)
