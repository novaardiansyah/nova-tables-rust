import ReactDOM from 'react-dom/client'
import './monaco'
import App from './App'
import ErrorBoundary from './components/common/ErrorBoundary'
import './index.css'

const rootElement = document.getElementById('root')
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  )
}
