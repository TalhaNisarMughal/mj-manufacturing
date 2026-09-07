import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import Bills from './pages/Bills'
import Customers from './pages/Customers'
import Dashboard from './pages/Dashboard'
import Ledgers from './pages/Ledgers'
import Login from './pages/Login'
import Store from './pages/Store'

function RequireAuth({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequireAdmin({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/customers" replace />
  return children
}

function Home() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'admin' ? '/dashboard' : '/customers'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route
                path="/dashboard"
                element={
                  <RequireAdmin>
                    <Dashboard />
                  </RequireAdmin>
                }
              />
              <Route path="/customers" element={<Customers />} />
              <Route path="/store" element={<Store />} />
              <Route path="/bills" element={<Bills />} />
              <Route path="/ledgers" element={<Ledgers />} />
            </Route>
            <Route path="/" element={<Home />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
