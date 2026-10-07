/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ValidateFileQuery} from '../../../../src/application/validation/queries/validate-file.query.js';
import {VALIDATION_RULE_GROUP} from '../../../../src/domain/validation/validation-rule.js';
import {InvalidInputException} from '../../../../src/shared/exceptions/invalid-input.exception.js';

describe('ValidateFileQuery', () => {
  it('parses a decimal projectId string to a number', () => {
    const query = new ValidateFileQuery('7', undefined, 'client-1');
    expect(query.projectId).toBe(7);
  });

  it('parses a hex projectId string to a number', () => {
    const query = new ValidateFileQuery('0x10', undefined, 'client-1');
    expect(query.projectId).toBe(16);
  });

  it('leaves group undefined when it is omitted', () => {
    const query = new ValidateFileQuery('7', undefined, 'client-1');
    expect(query.group).toBeUndefined();
  });

  it('keeps an explicit group', () => {
    const query = new ValidateFileQuery(
      '7',
      VALIDATION_RULE_GROUP.UploadFile,
      'client-1',
    );
    expect(query.group).toBe(VALIDATION_RULE_GROUP.UploadFile);
  });

  it.each(['abc', '', '0', '-3', '1.5'])(
    'rejects the invalid projectId %p',
    value => {
      expect(() => new ValidateFileQuery(value, undefined, 'client-1')).toThrow(
        InvalidInputException,
      );
    },
  );
});
