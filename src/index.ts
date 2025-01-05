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

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function runInstance(): Promise<string> {
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
  return region + '/' + instanceName
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
  let instances = ''
  for (let i = 0; i < count; i++) {
    try {
      const instance = await runInstance()
      instances += `${instances !== '' ? ',' : ''}` + instance
    } catch (error) {
      core.saveState('instances', instances)
      if (error instanceof Error) {
        core.setFailed(`failed to create android instance: ${error.message}`)
        return
      }
    }
  }
  core.saveState('instances', instances)
  // Wait for all devices to be connected
  const maxRetries = 30 // 30 seconds timeout
  let retryCount = 0
  let hosts: string[] = []

  while (retryCount < maxRetries) {
    const devices = await exec.getExecOutput('adb', ['devices'])
    hosts = devices.stdout
      .split('\n')
      .filter(line => line.includes('localhost') && line.includes('device'))

    if (hosts.length === count) {
      console.log(`\nConnected to ${hosts.length} devices on adb`)
      break
    }

    console.log(`Waiting for devices... (${hosts.length}/${count})`)
    await new Promise(resolve => setTimeout(resolve, 200))
    retryCount++
  }

  if (hosts.length < count) {
    core.setFailed(
      `Timeout: Only ${hosts.length}/${count} devices connected to adb`
    )
    return
  }
}

// eslint-disable-next-line
runInstances()
