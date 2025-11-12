import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Habilitar CORS
  app.enableCors({
    origin: ['http://localhost:3001'],
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  // 👉 Si quieres que todas las rutas empiecen con /api
  // app.setGlobalPrefix('api');

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`API on http://localhost:${port}`);

  // 👉 Depuración: listar todas las rutas mapeadas
  const server: any = app.getHttpServer();
  const router = server._events?.request?._router;
  if (router?.stack) {
    const routes = router.stack
      .filter((l: any) => l.route)
      .map((l: any) => ({
        path: l.route.path,
        methods: Object.keys(l.route.methods).join(',').toUpperCase(),
      }));
    console.log('ROUTES:', routes);
  }
}

bootstrap();
