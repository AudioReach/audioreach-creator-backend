/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

const {RuleTester} = require('eslint');
const rule = require('../no-domain-infrastructure-deps.cjs');

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

ruleTester.run('no-domain-infrastructure-deps', rule, {
  valid: [
    // Domain importing from domain is fine
    {
      code: 'import {Project} from "./project.js";',
      filename: 'packages/core/src/domain/entities/UseCase.ts',
    },
    // Infrastructure importing infrastructure is fine
    {
      code: 'import {Database} from "../../infrastructure/database.js";',
      filename:
        'packages/infrastructure/persistence/src/repositories/ProjectRepository.ts',
    },
  ],
  invalid: [
    {
      code: 'import {Database} from "../../infrastructure/database.js";',
      filename: 'packages/core/src/domain/entities/Project.ts',
      errors: [{messageId: 'domainInfrastructureDep'}],
    },
    {
      code: 'import {Request} from "express";',
      filename: 'packages/core/src/domain/entities/UseCase.ts',
      errors: [{messageId: 'domainInfrastructureDep'}],
    },
    {
      code: 'import {Connection} from "typeorm";',
      filename: 'packages/core/src/domain/entities/Project.ts',
      errors: [{messageId: 'domainInfrastructureDep'}],
    },
  ],
});
