import { BookOpen, LayoutDashboard, LogOut, Package, ReceiptText, Users } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">MJ</div>
          <div>
            <div className="brand-name">MJ Manufacturing</div>
            <div className="brand-sub">Store &amp; Ledger System</div>
          </div>
        </div>

        <nav className="nav">
          {user?.role === 'admin' && (
            <NavLink to="/dashboard" className="nav-link">
              <LayoutDashboard size={17} /> Dashboard
            </NavLink>
          )}
          <NavLink to="/customers" className="nav-link">
            <Users size={17} /> Customers
          </NavLink>
          <NavLink to="/store" className="nav-link">
            <Package size={17} /> Store
          </NavLink>
          <NavLink to="/bills" className="nav-link">
            <ReceiptText size={17} /> Bills &amp; Ledger
          </NavLink>
          <NavLink to="/ledgers" className="nav-link">
            <BookOpen size={17} /> Ledgers
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">{(user?.full_name || user?.email || '?')[0].toUpperCase()}</div>
            <div className="user-meta">
              <div className="user-name">{user?.full_name || user?.email}</div>
              <div className={`role-badge role-${user?.role}`}>{user?.role}</div>
            </div>
          </div>
          <button className="btn btn-ghost-dark" onClick={handleLogout}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
