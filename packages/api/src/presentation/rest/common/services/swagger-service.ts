import type {INestApplication} from '@nestjs/common';
import {DocumentBuilder, SwaggerModule} from '@nestjs/swagger';
import type {Request, Response} from 'express';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('AudioReach Creator API')
    .setDescription(
      'Audio Reach Creator API is an open source and cross platform backend framework for updating Audio Reach database files.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'AudioReach Creator API Documentation',
    customfavIcon: '/favicon.ico',
    customCss: '.swagger-ui .topbar { display: none }',
  });

  // Serve raw Swagger JSON

  app.use('api/docs-json', (_request: Request, response: Response) => {
    response.setHeader('Content-Type', 'application/json');
    response.send(document);
  });
}
