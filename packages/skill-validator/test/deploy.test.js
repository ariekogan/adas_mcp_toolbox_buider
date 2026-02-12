import { describe, it, expect } from 'vitest';

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('deploy slug validation', () => {
  it('accepts valid slugs', () => {
    expect(SLUG_REGEX.test('order-support')).toBe(true);
    expect(SLUG_REGEX.test('identity-assurance-manager')).toBe(true);
    expect(SLUG_REGEX.test('a')).toBe(true);
    expect(SLUG_REGEX.test('skill1')).toBe(true);
    expect(SLUG_REGEX.test('my-skill-v2')).toBe(true);
  });

  it('rejects invalid slugs', () => {
    expect(SLUG_REGEX.test('Order_Support')).toBe(false);
    expect(SLUG_REGEX.test('order support')).toBe(false);
    expect(SLUG_REGEX.test('-leading')).toBe(false);
    expect(SLUG_REGEX.test('trailing-')).toBe(false);
    expect(SLUG_REGEX.test('')).toBe(false);
    expect(SLUG_REGEX.test('UPPERCASE')).toBe(false);
    expect(SLUG_REGEX.test('has_underscore')).toBe(false);
    expect(SLUG_REGEX.test('has.dots')).toBe(false);
    expect(SLUG_REGEX.test('double--dash')).toBe(false);
  });
});
