/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Authentication constants
 */

//TBD: hardcode these for now. There could be several ways to define it.
//They should be defined in .env file for devleopment, and CI/CD pipeline on GitHub setting.
export const JWT_SECRET = process.env['JWT_SECRET'] ?? 'arc-web-api';
export const JWT_EXPIRE = '30d';
