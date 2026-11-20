import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import * as express from 'express';
import { join } from 'path';
import { mkdirSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';
  const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new URL(origin.includes('://') ? origin : `https://${origin}`).origin;
      } catch {
        throw new Error(`Invalid origin in CORS_ORIGINS: ${origin}`);
      }
    });

  if (isProduction && allowedOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must contain the deployed frontend origin in production.');
  }

  app.enableCors({
    origin: isProduction ? allowedOrigins : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Serve uploaded files (task attachments, creative/video versions)
  const uploadsDir = join(process.cwd(), 'uploads');
  mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir, { maxAge: '1h' }));
  app.use(express.json({ limit: '10mb' }));

  app.setGlobalPrefix('api/v1');

  await app.listen(process.env.PORT ?? 3001);
}

bootstrap();
