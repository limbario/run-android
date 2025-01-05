import * as core from '@actions/core'
import * as exec from '@actions/exec'

async function deleteInstances(): Promise<void> {
  process.env.LIM_TOKEN = core.getInput('token')
  process.env.LIM_ORGANIZATION_ID = core.getInput('organization-id')
  const instances = core.getState('instances')
  instances.split(',').forEach(async instance => {
    if (!instance.includes('/')) {
      return
    }
    const [region, instanceName] = instance.split('/')
    await deleteInstance(region, instanceName)
  })
}

/**
 * The cleanup function for the action.
 * @returns {Promise<void>} Resolves when the cleanup is complete.
 */
export async function deleteInstance(
  instanceName: string,
  region: string
): Promise<void> {
  try {
    if (!region || !instanceName) {
      core.warning('No instance information found to cleanup')
      return
    }

    core.info(`Cleaning up instance ${instanceName} in region ${region}`)

    const { exitCode, stdout, stderr } = await exec.getExecOutput('lim', [
      'delete',
      'android',
      `--region=${region}`,
      instanceName
    ])

    if (exitCode !== 0) {
      throw new Error(`${stdout} ${stderr}`)
    }

    core.info('Successfully cleaned up Android instance')
  } catch (error) {
    if (error instanceof Error) {
      // Use warning instead of setFailed for cleanup errors
      // This prevents cleanup errors from failing the workflow if the main action succeeded
      core.warning(`Failed to delete android instance: ${error.message}`)
    }
  }
}

// eslint-disable-next-line
deleteInstances()
