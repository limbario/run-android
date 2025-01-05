import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'
import { spawn } from 'child_process'
import * as path from 'path'

const LIM_VERSION = 'v0.8.13'
const SCRCPY_VERSION = 'v3.1'

async function installDependencies(): Promise<void> {
  const os = process.platform === 'darwin' ? 'macos' : process.platform
  const classicArch =
    process.arch === 'x64'
      ? 'x86_64'
      : process.arch === 'arm64'
        ? 'aarch64'
        : process.arch

  const scrcpyUrl = `https://github.com/Genymobile/scrcpy/releases/download/${SCRCPY_VERSION}/scrcpy-${os}-${classicArch}-${SCRCPY_VERSION}.tar.gz`
  const scrcpyTarPath = await tc.downloadTool(scrcpyUrl)
  const scrcpyExtractedPath = await tc.extractTar(scrcpyTarPath)

  await exec.exec('mv', [
    path.join(
      scrcpyExtractedPath,
      `scrcpy-${os}-${classicArch}-${SCRCPY_VERSION}/scrcpy`
    ),
    '/usr/local/bin/scrcpy'
  ])
  await exec.exec('mv', [
    path.join(
      scrcpyExtractedPath,
      `scrcpy-${os}-${classicArch}-${SCRCPY_VERSION}/scrcpy-server`
    ),
    '/usr/local/bin/scrcpy-server'
  ])
  await exec.exec('mv', [
    path.join(
      scrcpyExtractedPath,
      `scrcpy-${os}-${classicArch}-${SCRCPY_VERSION}/adb`
    ),
    '/usr/local/bin/adb'
  ])

  await exec.exec('chmod', ['+x', '/usr/local/bin/scrcpy'])
  await exec.exec('chmod', ['+x', '/usr/local/bin/scrcpy-server'])
  await exec.exec('chmod', ['+x', '/usr/local/bin/adb'])

  const limUrl = `https://github.com/limbario/homebrew-tap/releases/download/${LIM_VERSION}/lim-${process.platform}-${process.arch === 'x64' ? 'amd64' : process.arch}`
  const limPath = await tc.downloadTool(limUrl)
  await exec.exec('mv', [limPath, '/usr/local/bin/lim'])
  await exec.exec('chmod', ['+x', '/usr/local/bin/lim'])
}

async function runInstances(): Promise<void> {
  process.env.LIM_TOKEN = core.getInput('token')
  process.env.LIM_ORGANIZATION_ID = core.getInput('organization-id')
  process.env.LIM_REGION = core.getInput('region')
  const count = parseInt(core.getInput('count'))
  try {
    await installDependencies()
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) {
      core.setFailed(`dependency installation failed: ${error.message}`)
      return
    }
  }
  // Triggering the start of the adb daemon in parallel to save time.
  spawn('adb', ['start-server'])
  for (let i = 0; i < count; i++) {
    try {
      const instance = await runInstance()
      core.saveState('instances', core.getState('instances') + ',' + instance)
    } catch (error) {
      if (error instanceof Error) {
        core.setFailed(`failed to create android instance: ${error.message}`)
        return
      }
    }
  }
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function runInstance(): Promise<string> {
  let url = ''
  try {
    const { exitCode, stdout, stderr } = await exec.getExecOutput('lim', [
      'run',
      'android',
      '--tunnel=false',
      '--stream=false',
      '--output=url'
    ])
    if (exitCode !== 0) {
      core.setFailed(`failed to create android instance: ${stdout} ${stderr}`)
      return ''
    }
    url = stdout.trim()
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`failed to create android instance: ${error.message}`)
      return ''
    }
  }
  const urlMatch = url.match(/https:\/\/([^.]+).*\/instances\/([^/]+)$/)
  if (!urlMatch) {
    core.setFailed(`Failed to parse instance URL ${url}`)
    return ''
  }
  const [, region, instanceName] = urlMatch
  console.log(`\nConnecting to ${instanceName} in ${region}`)
  spawn(
    'lim',
    [
      'connect',
      'android',
      instanceName,
      `--region=${region}`,
      '--stream=false',
      '--tunnel=true'
    ],
    {
      detached: true,
      stdio: 'ignore'
    }
  ).unref()

  try {
    const { exitCode, stdout, stderr } = await exec.getExecOutput('adb', [
      'wait-for-device'
    ])
    if (exitCode !== 0) {
      core.setFailed(`failed to wait the device on adb: ${stdout} ${stderr}`)
      return ''
    }
    console.log(`\nConnected to ${instanceName} in ${region} on adb`)
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`failed to wait for the device: ${error.message}`)
      return ''
    }
  }
  return region + '/' + instanceName
}

// eslint-disable-next-line
runInstances()
