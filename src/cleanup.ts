import * as core from '@actions/core'
import * as exec from '@actions/exec'

async function deleteInstances(): Promise<void> {
  process.env.LIM_TOKEN = core.getInput('token')
  process.env.LIM_ORGANIZATION_ID = core.getInput('organization-id')
  const instances = core.getState('instances')
  core.info(`Deleting instances: ${instances}`)
  await Promise.all(
    instances.split(',').map(async instance => {
      if (!instance.includes('/')) {
        return
      }
      const [region, instanceName] = instance.split('/')
      return deleteInstance(region, instanceName)
    })
  )
  core.info('Successfully deleted all instances')
}

/**
 * The cleanup function for the action.
 * @returns {Promise<void>} Resolves when the cleanup is complete.
 */
async function deleteInstance(
  region: string,
  instanceName: string
): Promise<void> {
  try {
    if (!region || !instanceName) {
      core.warning('No instance information found to cleanup')
      return
    }
    const { exitCode, stdout, stderr } = await exec.getExecOutput(
      'lim',
      ['delete', 'android', `--region=${region}`, instanceName],
      {
        outStream: undefined,
        errStream: undefined
      }
    )

    if (exitCode !== 0) {
      throw new Error(
        `failed to delete ${instanceName} in region ${region}: ${stdout} ${stderr}`
      )
    }
    core.info(`Deleted instance ${instanceName} in region ${region}`)
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
