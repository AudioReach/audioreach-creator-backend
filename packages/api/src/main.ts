import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

// Placeholder app module - will be created in later stages
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set global prefix
  app.setGlobalPrefix("api/v1");

  // Set global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    })
  );

  // Enable CORS
  app.enableCors();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api/v1`);
}

try {
  await bootstrap();
} catch (error) {
  console.error("Failed to start application:", error);
  process.exit(1);
}
