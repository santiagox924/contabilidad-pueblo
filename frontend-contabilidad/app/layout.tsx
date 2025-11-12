// app/layout.tsx
import './globals.css'
import Providers from './providers'
import { AuthProvider } from '@/lib/auth'

export const metadata = {
  title: 'Contabilidad Pueblo',
  description: 'Frontend para el backend Nest + Prisma'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>
          <Providers>{children}</Providers>
        </AuthProvider>
      </body>
    </html>
  )
}
