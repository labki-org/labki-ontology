import { describe, test } from 'node:test'
import assert from 'node:assert'
import { validateVersionFormat, compareVersions } from './version-validator.js'

describe('validateVersionFormat', () => {
  test('valid semver format passes', () => {
    const result = validateVersionFormat('1.0.0')

    assert.strictEqual(result.valid, true)
    assert.ok(result.parsed)
    assert.strictEqual(result.parsed.major, 1)
    assert.strictEqual(result.parsed.minor, 0)
    assert.strictEqual(result.parsed.patch, 0)
    assert.strictEqual(result.error, null)
  })

  test('larger version numbers valid', () => {
    const result = validateVersionFormat('10.20.30')

    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.parsed.major, 10)
    assert.strictEqual(result.parsed.minor, 20)
    assert.strictEqual(result.parsed.patch, 30)
  })

  test('version with prerelease tag valid', () => {
    const result = validateVersionFormat('1.0.0-alpha.1')

    assert.strictEqual(result.valid, true)
    assert.ok(result.parsed.prerelease.length > 0)
  })

  test('version with build metadata valid', () => {
    const result = validateVersionFormat('1.0.0+build.123')

    assert.strictEqual(result.valid, true)
    assert.ok(result.parsed.build.length > 0)
  })

  test('invalid semver format fails', () => {
    const result = validateVersionFormat('not.a.version')

    assert.strictEqual(result.valid, false)
    assert.strictEqual(result.parsed, null)
    assert.ok(result.error.includes('Invalid semver'))
  })

  test('incomplete version fails', () => {
    const result = validateVersionFormat('1.0')

    assert.strictEqual(result.valid, false)
    assert.strictEqual(result.parsed, null)
  })

  test('version with extra parts fails', () => {
    const result = validateVersionFormat('1.0.0.0')

    assert.strictEqual(result.valid, false)
  })

  test('trims whitespace', () => {
    const result = validateVersionFormat('  1.0.0  ')

    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.parsed.version, '1.0.0')
  })

  test('empty string fails', () => {
    const result = validateVersionFormat('')

    assert.strictEqual(result.valid, false)
  })
})

describe('compareVersions', () => {
  test('PR version greater than base passes', () => {
    const result = compareVersions('1.1.0', '1.0.0')

    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.comparison, 1)
    assert.strictEqual(result.error, null)
  })

  test('major bump comparison works', () => {
    const result = compareVersions('2.0.0', '1.9.9')

    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.comparison, 1)
  })

  test('minor bump comparison works', () => {
    const result = compareVersions('1.2.0', '1.1.5')

    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.comparison, 1)
  })

  test('patch bump comparison works', () => {
    const result = compareVersions('1.0.1', '1.0.0')

    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.comparison, 1)
  })

  test('PR version equal to base fails', () => {
    const result = compareVersions('1.0.0', '1.0.0')

    assert.strictEqual(result.valid, false)
    assert.strictEqual(result.comparison, 0)
    assert.ok(result.error.includes('must be greater'))
  })

  test('PR version less than base fails', () => {
    const result = compareVersions('1.0.0', '1.1.0')

    assert.strictEqual(result.valid, false)
    assert.strictEqual(result.comparison, -1)
    assert.ok(result.error.includes('must be greater'))
  })

  test('invalid PR version fails', () => {
    const result = compareVersions('invalid', '1.0.0')

    assert.strictEqual(result.valid, false)
    assert.ok(result.error.includes('Invalid PR version'))
  })

  test('invalid base version fails', () => {
    const result = compareVersions('1.0.0', 'invalid')

    assert.strictEqual(result.valid, false)
    assert.ok(result.error.includes('Invalid base version'))
  })
})
