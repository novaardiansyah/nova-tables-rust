import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled React Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-base p-8 text-text">
          <div className="max-w-md rounded-lg border border-red-500/30 bg-surface p-6 shadow-xl">
            <h1 className="text-base font-semibold text-red-400">Application Error</h1>
            <p className="mt-2 text-xs text-text-soft">
              {this.state.error?.message || 'An unexpected error occurred while starting Nova Tables.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
            >
              Reload Application
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
