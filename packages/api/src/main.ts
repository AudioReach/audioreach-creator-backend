/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ValidationPipe} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import type {Logger} from '@arc/core';
import {setupSwagger} from './presentation/rest/common/services/swagger-service.js';
import {AppModule} from './app.module.js';
import {Tokens} from './presentation/rest/common/utils/index.js';
import {AllExceptionsFilter} from './infrastructure-wrapper/filters/all-exceptions.filter.js';
import {ValidationExceptionFilter} from './infrastructure-wrapper/filters/validation-exception.filter.js';

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

  // Register global exception filters
  const logger = app.get<Logger>('LOGGER');
  app.useGlobalFilters(
    new AllExceptionsFilter(logger),
    new ValidationExceptionFilter(logger),
  );

  const port = process.env.PORT ?? 3000;

  // Setup Swagger documentation for 'production' only.
  const buildType = process.env.NODE_ENV ?? Tokens.BUILD_DEVELOPMENT;
  if (buildType !== Tokens.BUILD_PRODUCTION) {
    setupSwagger(app);
    logger.logInfo({
      component: 'Bootstrap',
      action: 'setupSwagger',
      msg: `Swagger documentation available at: http://localhost:${port}/api/docs`,
      timestamp: new Date(),
      tag: 'startup',
    });
  }

  await app.listen(port);
  logger.logInfo({
    component: 'Bootstrap',
    action: 'startup',
    msg: `Application is running on: http://localhost:${port}/arc-api/v1`,
    timestamp: new Date(),
    tag: 'startup',
  });
}

try {
  await bootstrap();
} catch (error) {
  // We can't use the logger here since it might not be initialized yet
  console.error('Failed to start application:', error);
  process.exit(1);
}
