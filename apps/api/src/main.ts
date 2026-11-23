import "dotenv/config";
import "reflect-metadata";
import helmet from "helmet";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AlertsHub } from "./alerts/alerts.hub";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  app.use(helmet());
  app.enableCors({
    origin: allowedOrigin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);

  const httpServer = app.getHttpServer();
  const hub = app.get(AlertsHub);
  hub.attach(httpServer);
}

void bootstrap();
