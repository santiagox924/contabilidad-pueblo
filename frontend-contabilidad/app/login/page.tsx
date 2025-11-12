
'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import Cookies from 'js-cookie'
import { useAuth } from '@/lib/auth'
import { USER_ROLES, type UserRoleCode } from '@/lib/roles'

export default function LoginPage(){
  const [email, setEmail] = useState('admin@local.com')
  const [password, setPassword] = useState('12345678')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { setUser } = useAuth()

  async function submit(e: React.FormEvent){
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      const rawRoles: unknown = data?.user?.roles
      const validRoles = Array.isArray(rawRoles)
        ? rawRoles.filter((role): role is UserRoleCode =>
            Object.values(USER_ROLES).includes(String(role) as UserRoleCode),
          )
        : []
      const userId: number | undefined = data?.user?.id
      const userEmail: string = data?.user?.email ?? email

      Cookies.set('token', data.access_token, { expires: 7 })
      Cookies.set('email', userEmail, { expires: 7 })
      if (typeof userId === 'number') {
        Cookies.set('userId', String(userId), { expires: 7 })
      }
      Cookies.set('roles', validRoles.join(','), { expires: 7 })
      setUser({ id: userId ?? null, email: userEmail, roles: validRoles })
      window.location.href = '/dashboard'
    } catch (err:any) {
      setError(err?.response?.data?.message || 'Error al iniciar sesión')
    } finally { setLoading(false) }
  }

  return (
    <main className="container py-16">
      <div className="mx-auto max-w-md card">
        <h1 className="text-2xl font-semibold mb-6">Iniciar sesión</h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Correo</label>
            <input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com"/>
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button className="btn btn-primary w-full" disabled={loading}>{loading ? 'Ingresando...' : 'Entrar'}</button>
          <p className="text-xs text-gray-600 mt-2">Usuario semilla: admin@local.com / 12345678</p>
        </form>
      </div>
    </main>
  )
}
