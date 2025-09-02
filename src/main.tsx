import React from 'react'
import ReactDOM from 'react-dom/client'
import { Router, Route, RootRoute, RouterProvider, createHashHistory } from '@tanstack/react-router'
import './index.css'
import Bookshelf from './pages/Bookshelf'
import Reading from './pages/Reading'
import {  Outlet } from '@tanstack/react-router'

const rootRoute = new RootRoute({
  component: () => (
    <>
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
  validateSearch: (search: Record<string, unknown>): { bookId?: string } => {
    return {
      bookId: typeof search.bookId === 'string' ? search.bookId : undefined,
    }
  },
})

const routeTree = rootRoute.addChildren([indexRoute, readingRoute])

const hashHistory = createHashHistory()
const router = new Router({ routeTree, history: hashHistory })

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