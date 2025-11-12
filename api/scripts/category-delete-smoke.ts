import { Test } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AppModule } from '../src/app.module'

async function main() {
  let app: INestApplication | null = null
  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@local.com', password: '12345678' })

    if (loginRes.status !== 201 && loginRes.status !== 200) {
      throw new Error(`Falló login (${loginRes.status}): ${JSON.stringify(loginRes.body)}`)
    }

  const token = loginRes.body?.access_token
    if (!token) throw new Error('Login no retornó accessToken')

    const createRes = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Temporal smoke', taxProfile: 'IVA_RESPONSABLE' })

    if (createRes.status !== 201) {
      throw new Error(`Falló creación (${createRes.status}): ${JSON.stringify(createRes.body)}`)
    }

    const createdId = createRes.body?.id
    console.log('✅ Categoría creada para prueba:', createRes.body)

    const deleteRes = await request(app.getHttpServer())
      .delete(`/categories/${createdId}`)
      .set('Authorization', `Bearer ${token}`)

    if (deleteRes.status !== 200) {
      throw new Error(`Falló borrado (${deleteRes.status}): ${JSON.stringify(deleteRes.body)}`)
    }
    console.log('🗑️  Categoría eliminada:', deleteRes.body)

    const fetchRes = await request(app.getHttpServer())
      .get(`/categories/${createdId}`)
      .set('Authorization', `Bearer ${token}`)

    console.log('🔍 Consulta tras borrar (espera 404):', fetchRes.status)
  } finally {
    if (app) await app.close()
  }
}

main().catch((err) => {
  console.error('❌ Error en smoke test', err)
  process.exit(1)
})
