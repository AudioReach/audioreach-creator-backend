import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { setupSwagger } from "./presentation/rest/common/services/swagger-service.js";
import { AppModule } from "./app.module.js";
import { Tokens } from './presentation/rest/common/utils/index.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Enable CORS
  app.enableCors();




  const port = process.env.PORT ?? 3000;

  // Setup Swagger documentation for 'production' only.
  const buildType = process.env.NODE_ENV ?? Tokens.BUILD_DEVELOPMENT;
  if (buildType !== Tokens.BUILD_PRODUCTION) {
    setupSwagger(app);
    console.log(`Swagger documentation available at: http://localhost:${port}/api/docs`);
  }

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api/v1`);
}

try {
  await bootstrap();
} catch (error) {
  console.error("Failed to start application:", error);
  process.exit(1);
}
