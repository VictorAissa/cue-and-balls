import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {RedisIoAdapter} from "./adapters/redis-io.adapter";
import {ValidationPipe} from "@nestjs/common";
import {DocumentBuilder, SwaggerModule} from "@nestjs/swagger";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const allowedOrigins = new Set([
        'http://localhost:5173',
        'http://127.0.0.1:5173',
      ]);
      const lanOriginPattern = /^http:\/\/(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?::5173)?$/;

      callback(null, allowedOrigins.has(origin) || lanOriginPattern.test(origin));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  const config = new DocumentBuilder()
      .setTitle('Cue & Balls')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api', app, document);
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
  }));
  app.useWebSocketAdapter(redisIoAdapter);
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
