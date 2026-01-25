import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Run a CLI script and capture its output
 *
 * @param {string} script - Script name (relative to scripts/)
 * @param {Object} options - Run options
 * @param {string[]} options.args - Command-line arguments
 * @param {string} options.cwd - Working directory
 * @param {Object} options.env - Additional environment variables
 * @param {string} options.stdin - Input to provide to stdin
 * @returns {Promise<{exitCode: number, stdout: string, stderr: string}>}
 *
 * @example
 * const result = await runCLI('validate.js', {
 *   args: ['--changed-only'],
 *   cwd: tempDir.path
 * })
 */
export async function runCLI(script, options = {}) {
  const {
    args = [],
    cwd = process.cwd(),
    env = {},
    stdin = null,
    timeout = 30000
  } = options

  const scriptPath = path.resolve(__dirname, '../../', script)

  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    // Provide stdin if specified
    if (stdin !== null) {
      proc.stdin.write(stdin)
      proc.stdin.end()
    } else {
      proc.stdin.end()
    }

    // Set timeout
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(`CLI script timed out after ${timeout}ms`))
    }, timeout)

    proc.on('close', (exitCode) => {
      clearTimeout(timer)
      resolve({
        exitCode: exitCode ?? -1,
        stdout,
        stderr
      })
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

/**
 * Run a CLI script that outputs JSON and parse the result
 *
 * @param {string} script - Script name (relative to scripts/)
 * @param {Object} options - Run options (same as runCLI)
 * @returns {Promise<{exitCode: number, data: any, stderr: string}>}
 */
export async function runCLIJSON(script, options = {}) {
  const result = await runCLI(script, options)

  let data = null
  if (result.stdout.trim()) {
    try {
      data = JSON.parse(result.stdout)
    } catch (err) {
      // Not valid JSON, leave as null
    }
  }

  return {
    exitCode: result.exitCode,
    data,
    stdout: result.stdout,
    stderr: result.stderr
  }
}
