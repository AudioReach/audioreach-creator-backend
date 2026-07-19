/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  SessionRequiredError,
  SessionModeNotAllowedError,
} from '../../../../../src/application/orchestration/cqrs/errors.js';
import {SESSION_MODE} from '../../../../../src/application/shared/change-vocabulary.js';

describe('SessionRequiredError', () => {
  it('should be an instance of Error', () => {
    const err = new SessionRequiredError('PatchSpfModuleCommand');
    expect(err).toBeInstanceOf(Error);
  });

  it('should carry commandName', () => {
    const err = new SessionRequiredError('PatchSpfModuleCommand');
    expect(err.commandName).toBe('PatchSpfModuleCommand');
  });

  it('should have a descriptive message', () => {
    const err = new SessionRequiredError('PatchSpfModuleCommand');
    expect(err.message).toContain('PatchSpfModuleCommand');
  });

  it('should have the correct name property', () => {
    const err = new SessionRequiredError('PatchSpfModuleCommand');
    expect(err.name).toBe('SessionRequiredError');
  });
});

describe('SessionModeNotAllowedError', () => {
  const commandName = 'AddModuleCommand';
  const currentMode = SESSION_MODE.Tuning;
  const allowedModes = [SESSION_MODE.Designer, SESSION_MODE.DiffMerge] as const;

  it('should be an instance of Error', () => {
    const err = new SessionModeNotAllowedError(
      commandName,
      currentMode,
      allowedModes,
    );
    expect(err).toBeInstanceOf(Error);
  });

  it('should carry commandName', () => {
    const err = new SessionModeNotAllowedError(
      commandName,
      currentMode,
      allowedModes,
    );
    expect(err.commandName).toBe(commandName);
  });

  it('should carry currentMode', () => {
    const err = new SessionModeNotAllowedError(
      commandName,
      currentMode,
      allowedModes,
    );
    expect(err.currentMode).toBe(SESSION_MODE.Tuning);
  });

  it('should carry allowedModes', () => {
    const err = new SessionModeNotAllowedError(
      commandName,
      currentMode,
      allowedModes,
    );
    expect(err.allowedModes).toEqual([
      SESSION_MODE.Designer,
      SESSION_MODE.DiffMerge,
    ]);
  });

  it('should have a descriptive message containing the command name and current mode', () => {
    const err = new SessionModeNotAllowedError(
      commandName,
      currentMode,
      allowedModes,
    );
    expect(err.message).toContain(commandName);
    expect(err.message).toContain(currentMode);
  });

  it('should have the correct name property', () => {
    const err = new SessionModeNotAllowedError(
      commandName,
      currentMode,
      allowedModes,
    );
    expect(err.name).toBe('SessionModeNotAllowedError');
  });
});
