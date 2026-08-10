/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {NestFactory} from '@nestjs/core';
import {DocumentBuilder, SwaggerModule} from '@nestjs/swagger';
import {writeFileSync, mkdirSync} from 'node:fs';
import {cleanupOpenApiDoc} from 'nestjs-zod';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AppModule} from '../app.module.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generates Swagger API documentation as JSON file
 * This script bootstraps the NestJS application, generates the Swagger document,
 * and saves it to docs/swagger-api.json in the project root
 */
async function generateSwaggerJson(): Promise<void> {
  console.log('🚀 Starting Swagger JSON generation...');

  let app;

  try {
    // Create NestJS application instance
    console.log('📦 Creating NestJS application...');
    app = await NestFactory.create(AppModule, {
      logger: false, // Disable logging during generation
    });

    // Configure Swagger document builder with the same settings as the main app
    console.log('📝 Building Swagger document...');
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
          description: 'Enter JWT token',
        },
        'JWT-auth',
      )
      .build();

    // Generate the Swagger document
    const document = cleanupOpenApiDoc(
      SwaggerModule.createDocument(app, config),
    );

    // Determine output path (project root/docs/swagger-api.json)
    const projectRoot = path.join(__dirname, '../../../..');
    const docsDir = path.join(projectRoot, 'docs');
    const outputPath = path.join(docsDir, 'swagger-api.json');

    // Ensure docs directory exists
    console.log('📁 Ensuring docs directory exists...');
    mkdirSync(docsDir, {recursive: true});

    // Write the Swagger JSON to file
    console.log('💾 Writing Swagger JSON to:', outputPath);
    writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf8');

    console.log('✅ Swagger JSON generation completed successfully!');
    console.log('📄 File saved to:', outputPath);
  } catch (error) {
    console.error('❌ Error generating Swagger JSON:', error);
    throw error;
  } finally {
    // Ensure the application is properly closed
    if (app) {
      console.log('🔄 Closing NestJS application...');
      await app.close();
    }
  }
}

// Execute the generation if this script is run directly
const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  try {
    await generateSwaggerJson();
    console.log('🎉 Swagger generation process completed!');
    process.exit(0);
  } catch (error) {
    console.error('💥 Fatal error during Swagger generation:', error);
    process.exit(1);
  }
}

export {generateSwaggerJson};
