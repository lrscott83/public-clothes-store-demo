import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module.js';
import { installGlobalPipes } from './main-setup.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  installGlobalPipes(app);
  const port = process.env.PORT ?? 3002;
  await app.listen(port);
  console.log(`api-idp listening on port ${port}`);
}

void bootstrap();
