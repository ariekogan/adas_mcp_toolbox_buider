import { describe, it, expect } from 'vitest';
import { validateSolution } from '../src/validators/solutionValidator.js';

/**
 * Connector mcp_store validation tests.
 *
 * These check that the validator catches common deployment failures:
 * - Missing package.json when server code uses npm packages
 * - Missing dependencies in package.json
 * - Deprecated /opt/mcp-connectors/ paths
 * - Path mismatches between connector id and /mcp-store/ reference
 */

function baseSolution() {
  return { id: 'test', name: 'Test', skills: [], grants: [], handoffs: [], routing: {} };
}

function ctx(connectors, mcp_store = {}) {
  return { connectors, mcp_store };
}

describe('connector mcp_store validation', () => {

  // ── Missing package.json ────────────────────────────────────

  it('errors when server.js uses require() but no package.json in mcp_store', () => {
    const result = validateSolution(baseSolution(), ctx(
      [{ id: 'my-mcp', transport: 'stdio' }],
      {
        'my-mcp': [
          { path: 'server.js', content: `
            const Database = require('better-sqlite3');
            const { Server } = require('@modelcontextprotocol/sdk/server');
          ` },
        ],
      }
    ));

    const err = result.errors.find(e => e.check === 'connector_missing_package_json');
    expect(err).toBeDefined();
    expect(err.message).toContain('better-sqlite3');
    expect(err.message).toContain('package.json');
    expect(err.connector).toBe('my-mcp');
  });

  it('errors when server.js uses ES imports but no package.json', () => {
    const result = validateSolution(baseSolution(), ctx(
      [{ id: 'my-mcp', transport: 'stdio' }],
      {
        'my-mcp': [
          { path: 'server.js', content: `
            import { Server } from '@modelcontextprotocol/sdk/server';
            import express from 'express';
          ` },
        ],
      }
    ));

    const err = result.errors.find(e => e.check === 'connector_missing_package_json');
    expect(err).toBeDefined();
    expect(err.message).toContain('@modelcontextprotocol/sdk/server');
  });

  it('no error when server code only uses Node builtins', () => {
    const result = validateSolution(baseSolution(), ctx(
      [{ id: 'my-mcp', transport: 'stdio' }],
      {
        'my-mcp': [
          { path: 'server.js', content: `
            const fs = require('fs');
            const path = require('path');
            console.log('hello');
          ` },
        ],
      }
    ));

    const err = result.errors.find(e => e.check === 'connector_missing_package_json');
    expect(err).toBeUndefined();
  });

  it('no error when package.json is included with require() code', () => {
    const result = validateSolution(baseSolution(), ctx(
      [{ id: 'my-mcp', transport: 'stdio' }],
      {
        'my-mcp': [
          { path: 'server.js', content: `const db = require('better-sqlite3');` },
          { path: 'package.json', content: '{"name":"my-mcp","dependencies":{"better-sqlite3":"*"}}' },
        ],
      }
    ));

    const err = result.errors.find(e => e.check === 'connector_missing_package_json');
    expect(err).toBeUndefined();
  });

  // ── Missing dependencies in package.json ────────────────────

  it('warns when package.json is missing a required dependency', () => {
    const result = validateSolution(baseSolution(), ctx(
      [{ id: 'my-mcp', transport: 'stdio' }],
      {
        'my-mcp': [
          { path: 'server.js', content: `
            const db = require('better-sqlite3');
            const { Server } = require('@modelcontextprotocol/sdk/server');
          ` },
          { path: 'package.json', content: '{"name":"my-mcp","dependencies":{"better-sqlite3":"*"}}' },
        ],
      }
    ));

    const warn = result.warnings.find(w => w.check === 'connector_missing_dependencies');
    expect(warn).toBeDefined();
    expect(warn.message).toContain('@modelcontextprotocol/sdk');
  });

  it('no warning when all dependencies are declared', () => {
    const result = validateSolution(baseSolution(), ctx(
      [{ id: 'my-mcp', transport: 'stdio' }],
      {
        'my-mcp': [
          { path: 'server.js', content: `const db = require('better-sqlite3');` },
          { path: 'package.json', content: '{"name":"my-mcp","dependencies":{"better-sqlite3":"*"}}' },
        ],
      }
    ));

    const warn = result.warnings.find(w => w.check === 'connector_missing_dependencies');
    expect(warn).toBeUndefined();
  });

  it('ignores Node.js builtins when checking dependencies', () => {
    const result = validateSolution(baseSolution(), ctx(
      [{ id: 'my-mcp', transport: 'stdio' }],
      {
        'my-mcp': [
          { path: 'server.js', content: `
            const fs = require('fs');
            const path = require('path');
            const http = require('http');
            const crypto = require('crypto');
            const db = require('better-sqlite3');
          ` },
          { path: 'package.json', content: '{"name":"my-mcp","dependencies":{"better-sqlite3":"*"}}' },
        ],
      }
    ));

    const warn = result.warnings.find(w => w.check === 'connector_missing_dependencies');
    expect(warn).toBeUndefined();
  });

  // ── Deprecated /opt/mcp-connectors/ path ────────────────────

  it('errors on deprecated /opt/mcp-connectors/ path in args', () => {
    const result = validateSolution(baseSolution(), ctx(
      [{ id: 'my-mcp', transport: 'stdio', command: 'node', args: ['/opt/mcp-connectors/my-mcp/server.js'] }],
      {
        'my-mcp': [{ path: 'server.js', content: 'console.log("hi")' }],
      }
    ));

    const err = result.errors.find(e => e.check === 'connector_deprecated_path');
    expect(err).toBeDefined();
    expect(err.message).toContain('/opt/mcp-connectors/');
    expect(err.fix).toContain('auto-resolve');
  });

  it('no error for correct /mcp-store/ path', () => {
    const result = validateSolution(baseSolution(), ctx(
      [{ id: 'my-mcp', transport: 'stdio', command: 'node', args: ['/mcp-store/my-mcp/server.js'] }],
      {
        'my-mcp': [{ path: 'server.js', content: 'console.log("hi")' }],
      }
    ));

    const err = result.errors.find(e => e.check === 'connector_deprecated_path');
    expect(err).toBeUndefined();
  });

  // ── Path mismatch ───────────────────────────────────────────

  it('warns when /mcp-store/ path does not match connector id', () => {
    const result = validateSolution(baseSolution(), ctx(
      [{ id: 'my-mcp', transport: 'stdio', command: 'node', args: ['/mcp-store/wrong-id/server.js'] }],
      {
        'my-mcp': [{ path: 'server.js', content: 'console.log("hi")' }],
      }
    ));

    const warn = result.warnings.find(w => w.check === 'connector_path_mismatch');
    expect(warn).toBeDefined();
    expect(warn.message).toContain('wrong-id');
    expect(warn.message).toContain('my-mcp');
  });

  it('no warning when /mcp-store/ path matches connector id', () => {
    const result = validateSolution(baseSolution(), ctx(
      [{ id: 'my-mcp', transport: 'stdio', command: 'node', args: ['/mcp-store/my-mcp/server.js'] }],
      {
        'my-mcp': [{ path: 'server.js', content: 'console.log("hi")' }],
      }
    ));

    const warn = result.warnings.find(w => w.check === 'connector_path_mismatch');
    expect(warn).toBeUndefined();
  });

  // ── No mcp_store — skip all deep checks ─────────────────────

  it('skips deep checks when connector has no mcp_store files', () => {
    const result = validateSolution(baseSolution(), ctx(
      [{ id: 'prebuilt-mcp', transport: 'stdio' }],
      {}
    ));

    // Only the "no server code" error, not the deep checks
    const deepChecks = result.errors.filter(e =>
      ['connector_missing_package_json', 'connector_deprecated_path', 'connector_path_mismatch'].includes(e.check)
    );
    expect(deepChecks).toHaveLength(0);
  });

  // ── ChatGPT's exact failure scenario ────────────────────────

  it('catches the exact ChatGPT clinic scheduler failure', () => {
    const result = validateSolution(baseSolution(), ctx(
      [{
        id: 'calendar-config-store-mcp',
        transport: 'stdio',
        command: 'node',
        args: ['/opt/mcp-connectors/calendar-config-store-mcp/server.js'],
      }],
      {
        'calendar-config-store-mcp': [
          {
            path: 'server.js',
            content: `
              const Database = require('better-sqlite3');
              const { Server } = require('@modelcontextprotocol/sdk/server');
              const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio');
            `,
          },
          // No package.json!
        ],
      }
    ));

    // Should catch BOTH problems:
    // 1. Missing package.json (better-sqlite3, @modelcontextprotocol/sdk need npm install)
    const pkgErr = result.errors.find(e => e.check === 'connector_missing_package_json');
    expect(pkgErr).toBeDefined();
    expect(pkgErr.message).toContain('better-sqlite3');

    // 2. Deprecated /opt/mcp-connectors/ path
    const pathErr = result.errors.find(e => e.check === 'connector_deprecated_path');
    expect(pathErr).toBeDefined();
    expect(pathErr.message).toContain('/opt/mcp-connectors/');
  });
});
