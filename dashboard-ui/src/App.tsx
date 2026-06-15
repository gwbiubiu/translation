import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Translation from './pages/Translation'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AuthGuard from './components/AuthGuard'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<Translation />} />
        <Route path="/login"     element={<Login />} />
        <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
      </Routes>
    </BrowserRouter>
  )
}
