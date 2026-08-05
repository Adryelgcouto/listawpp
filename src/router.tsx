import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { AppShell } from '@/components/layout/AppShell'
import { AuthGate } from '@/components/layout/AuthGate'
import { HojeScreen } from '@/screens/HojeScreen'
import { EscanearScreen } from '@/screens/EscanearScreen'
import { ClientesScreen } from '@/screens/ClientesScreen'
import { FilaScreen } from '@/screens/FilaScreen'
import { ConfigScreen } from '@/screens/ConfigScreen'
import { LoginScreen } from '@/screens/LoginScreen'

const rootRoute = createRootRoute({
  component: () => (
    <AuthGate>
      <Outlet />
    </AuthGate>
  ),
})

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  component: HojeScreen,
})

const escanearRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/escanear',
  component: EscanearScreen,
})

const clientesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/clientes',
  component: ClientesScreen,
})

const filaRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/fila',
  component: FilaScreen,
})

const configRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/config',
  component: ConfigScreen,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginScreen,
})

const routeTree = rootRoute.addChildren([
  appLayoutRoute.addChildren([
    indexRoute,
    escanearRoute,
    clientesRoute,
    filaRoute,
    configRoute,
  ]),
  loginRoute,
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
