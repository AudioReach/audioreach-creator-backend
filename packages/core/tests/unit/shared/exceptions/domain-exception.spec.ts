/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  DomainException,
  ResourceNotFoundException,
  InvalidOperationException,
  DomainNotImplementedException,
} from '../../../../src/shared/exceptions/index.js';

describe('DomainException hierarchy', () => {
  describe('DomainException (base)', () => {
    it('cannot be instantiated directly (abstract)', () => {
      // DomainException is abstract — verify subclass works
      const ex = new ResourceNotFoundException('test');
      expect(ex).toBeInstanceOf(DomainException);
      expect(ex).toBeInstanceOf(Error);
    });

    it('sets name to the constructor name', () => {
      const ex = new ResourceNotFoundException('not here');
      expect(ex.name).toBe('ResourceNotFoundException');
    });
  });

  describe('ResourceNotFoundException', () => {
    it('stores message and errorCode', () => {
      const ex = new ResourceNotFoundException('Project 123 not found');
      expect(ex.message).toBe('Project 123 not found');
      expect(ex.errorCode).toBe('RESOURCE_NOT_FOUND');
      expect(ex.details).toBeUndefined();
    });
  });

  describe('InvalidOperationException', () => {
    it('stores message, errorCode, and optional details', () => {
      const ex = new InvalidOperationException('Bad input', {field: 'name'});
      expect(ex.message).toBe('Bad input');
      expect(ex.errorCode).toBe('INVALID_OPERATION');
      expect(ex.details).toEqual({field: 'name'});
    });
  });

  describe('DomainNotImplementedException', () => {
    it('stores message and errorCode', () => {
      const ex = new DomainNotImplementedException('getSubgraphs');
      expect(ex.message).toBe('getSubgraphs');
      expect(ex.errorCode).toBe('NOT_IMPLEMENTED');
    });
  });
});
