import React from 'react'
import ReactDOM from 'react-dom/client'
import { Router, Route, RootRoute, RouterProvider } from '@tanstack/react-router'
import './index.css'
import Bookshelf from './pages/Bookshelf'
import Reading from './pages/Reading'
import { Link, Outlet } from '@tanstack/react-router'

const rootRoute = new RootRoute({
  component: () => (
    <>
      <div style={{ 
        padding: '20px',
        backgroundColor: '#fff',
        borderBottom: '1px solid #eee',
        display: 'flex',
        gap: '20px'
      }}>
        <Link to="/" style={{ textDecoration: 'none', color: '#333' }}>
          [书架]
        </Link>
        <Link to="/reading" style={{ textDecoration: 'none', color: '#333' }}>
          [阅读页]
        </Link>
      </div>
      <Outlet />
    </>
  ),
})

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Bookshelf,
})

const readingRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/reading',
  component: Reading,
})

const routeTree = rootRoute.addChildren([indexRoute, readingRoute])

const router = new Router({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)