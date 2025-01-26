import * as core from '@actions/core'
import * as exec from '@actions/exec'

import { Instance } from './index'

process.env.LIM_TOKEN = core.getInput('token')

async function deleteInstances(): Promise<void> {
  const instances = JSON.parse(core.getState('instances') ?? []) as [Instance]
  core.info(
    `Deleting instances: \n${instances.map(i => i.organizationId + '/' + i.region + '/' + i.name).join('\n')}`
  )
  try {
    await Promise.all(instances.map(deleteInstance))
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) {
      core.setFailed(`failed to delete instances: ${error.message}`)
      return
    }
    throw error
  }
  core.info('Successfully deleted all instances')
}

/**
 * The cleanup function for the action.
 * @returns {Promise<void>} Resolves when the cleanup is complete.
 */
async function deleteInstance(instance: Instance): Promise<void> {
  const { exitCode, stdout, stderr } = await exec.getExecOutput('lim', [
    'delete',
    'android',
    `--region=${instance.region}`,
    `--organization-id=${instance.organizationId}`,
    instance.name
  ])
  core.info(`Deleted instance ${instance.name} in region ${instance.region}`)
  if (exitCode !== 0) {
    throw new Error(
      `failed to delete ${instance.name} in region ${instance.region}: ${stdout} ${stderr}`
    )
  }
}

// eslint-disable-next-line
deleteInstances()
