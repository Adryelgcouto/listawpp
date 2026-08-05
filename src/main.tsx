import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { router } from './router'
import { HydrationGate } from './HydrationGate'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HydrationGate>
      <RouterProvider router={router} />
      <Toaster
        theme="dark"
        position="top-center"
        richColors
        closeButton
        toastOptions={{
          style: {
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          },
        }}
      />
    </HydrationGate>
  </StrictMode>,
)
