/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

const {RuleTester} = require('eslint');
const rule = require('../no-controller-try-catch.cjs');

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

ruleTester.run('no-controller-try-catch', rule, {
  valid: [
    // No try-catch is fine
    {
      code: `
        class Controller {
          async getProject(req, res) {
            const project = await this.useCase.execute(req.params.id);
            res.json(project);
          }
        }
      `,
      filename: 'packages/api/src/presentation/ProjectController.ts',
    },
    // Try-catch in non-controller files is allowed
    {
      code: `
        class UseCase {
          async execute(command) {
            try {
              await this.uow.commit();
            } catch (error) {
              await this.uow.rollback();
              throw error;
            }
          }
        }
      `,
      filename: 'packages/core/src/application/CreateProjectUseCase.ts',
    },
  ],
  invalid: [
    {
      code: `
        class Controller {
          async getProject(req, res) {
            try {
              const project = await this.useCase.execute(req.params.id);
              res.json(project);
            } catch (error) {
              res.status(500).json({ error: 'Failed' });
            }
          }
        }
      `,
      filename: 'packages/api/src/presentation/ProjectController.ts',
      errors: [{messageId: 'controllerTryCatch'}],
    },
    {
      code: `
        class Controller {
          async createProject(req, res) {
            try {
              const result = await this.service.create(req.body);
              res.status(201).json(result);
            } catch (err) {
              res.status(400).json({ error: err.message });
            }
          }
        }
      `,
      filename: 'packages/api/src/presentation/DefinitionsController.ts',
      errors: [{messageId: 'controllerTryCatch'}],
    },
  ],
});
