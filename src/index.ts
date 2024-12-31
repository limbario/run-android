import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'
import { spawn } from 'child_process'
import * as path from 'path'

// Do not manually change these versions, they are set as part of the release process.
const LIM_VERSION = 'v0.8.12'
const SCRCPY_VERSION = 'v3.1'

async function installDependencies(): Promise<void> {
  const scrcpyUrl = `https://github.com/Genymobile/scrcpy/releases/download/${SCRCPY_VERSION}/scrcpy-linux-x86_64-${SCRCPY_VERSION}.tar.gz`
  const scrcpyTarPath = await tc.downloadTool(scrcpyUrl)
  const scrcpyExtractedPath = await tc.extractTar(scrcpyTarPath)

  await exec.exec('mv', [
    path.join(
      scrcpyExtractedPath,
      `scrcpy-linux-x86_64-${SCRCPY_VERSION}/scrcpy`
    ),
    '/usr/local/bin/scrcpy'
  ])
  await exec.exec('mv', [
    path.join(
      scrcpyExtractedPath,
      `scrcpy-linux-x86_64-${SCRCPY_VERSION}/scrcpy-server`
    ),
    '/usr/local/bin/scrcpy-server'
  ])
  await exec.exec('mv', [
    path.join(scrcpyExtractedPath, `scrcpy-linux-x86_64-${SCRCPY_VERSION}/adb`),
    '/usr/local/bin/adb'
  ])

  await exec.exec('chmod', ['+x', '/usr/local/bin/scrcpy'])
  await exec.exec('chmod', ['+x', '/usr/local/bin/scrcpy-server'])
  await exec.exec('chmod', ['+x', '/usr/local/bin/adb'])

  const limUrl = `https://github.com/limbario/homebrew-tap/releases/download/${LIM_VERSION}/lim-linux-amd64`
  const limPath = await tc.downloadTool(limUrl)
  await exec.exec('mv', [limPath, '/usr/local/bin/lim'])
  await exec.exec('chmod', ['+x', '/usr/local/bin/lim'])
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function runInstance(): Promise<void> {
  try {
    await installDependencies()
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error)
      core.setFailed(`dependency installation failed: ${error.message}`)
  }
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
      throw new Error(`failed to create android instance: ${stdout} ${stderr}`)
    }
    url = stdout.trim()
  } catch (error) {
    if (error instanceof Error)
      core.setFailed(`failed to create android instance: ${error.message}`)
  }
  const urlMatch = url.match(/https:\/\/([^.]+).*\/instances\/([^/]+)$/)
  if (!urlMatch) {
    throw new Error(`Failed to parse instance URL ${url}`)
  }
  const [, region, instanceName] = urlMatch
  core.saveState('region', region)
  core.saveState('instanceName', instanceName)
  console.log(
    `A new Android instance ${instanceName} has been created in ${region}`
  )

  console.log(`Connecting to ${instanceName} in ${region}`)
  spawn('lim', [
    'connect',
    'android',
    `--region=${region}`,
    '--stream=false',
    '--tunnel=true'
  ])
}

// eslint-disable-next-line
runInstance()
