import { SecretsManager } from '@aws-sdk/client-secrets-manager'
import response from 'cfn-response'
import mysql from 'mysql2'

const secrets = new SecretsManager({
  logger: console,
})

// This can be tested locally using
// docker run --rm -d --name mysql-container -e MYSQL_ROOT_PASSWORD=mysql -p 3306:3306 -d mysql:latest
// node invoke-locally.js
export async function handler(event, context, callback) {
  console.log('Request event:', JSON.stringify(event))
  let {
    localConfig = {},
    databaseHost = 'localhost',
    databaseSecretName,
    appDatabaseName,
    appDatabaseSecretName,
    stage = 'sand',
  } = event.ResourceProperties

  appDatabaseName = appDatabaseName ?? `cortex-${stage}`

  const physicalResourceId = `${databaseHost}#${appDatabaseName}-initialization`

  let connection
  try {
    if (!['prod', 'stage', 'dev', 'sand'].includes(stage)) {
      throw new Error(`Invalid 'stage' argument: ${stage}`)
    }

    console.log(
      `Loading connection information for database at "${databaseHost}" from "${databaseSecretName || 'localConfig'}"`,
    )
    const { username, password } = databaseSecretName
      ? await getSecretValue(databaseSecretName)
      : localConfig

    console.log(
      `Getting app database user credentials from "${appDatabaseSecretName || 'localConfig'}"...`,
    )

    const appDatabaseSecretValue = appDatabaseSecretName
      ? await getSecretValue(appDatabaseSecretName)
      : localConfig.appUser
    const appDatabasePassword = appDatabaseSecretValue.password
    const appDatabaseUsername = appDatabaseSecretValue.username

    if (!appDatabasePassword) {
      console.error(
        `"${databaseSecretName || 'localConfig.appUser'}" does not have the required property 'password'`,
      )

      throw new Error(`no password for the app-secret '${appDatabaseSecretName}' could be found!`)
    }

    console.log(
      `Got app database user credentials for secret ${appDatabaseSecretName}`,
    )

    let userAuthentication = `IDENTIFIED WITH caching_sha2_password BY '${appDatabasePassword}'`

    console.log(`Connecting to database as user "${username}"`)

    connection = mysql.createConnection({
      host: databaseHost,
      user: username,
      password,
      multipleStatements: true,
    })
    connection.connect(function(err) {
      if (err) {
        console.log('Failed to connect to database: ' + err)
        throw err
      }
    })

    switch (event.RequestType) {
      case 'Create':
      case 'Update':
        await createSchema(
          connection,
          appDatabaseName,
          appDatabaseUsername,
          userAuthentication,
        )
        break
      case 'Delete':
        if (['sand'].includes(stage)) {
          await deleteSchema(
            connection,
            appDatabaseName,
            appDatabaseUsername,
          )
        } else {
          console.log('"Delete" action is not supported in this environment, skipping')
        }
        break
      default:
        throw new Error(`Unknown request event type: ${event.RequestType}`)
    }

    sendCfnResponse(event, context, callback, physicalResourceId)
  } catch (err) {
    sendCfnResponse(event, context, callback, physicalResourceId, err)
  } finally {
    if (connection && connection.state !== 'disconnected') {
      console.log('Disconnecting from database')
      connection.end(function(err) {
        if (err) {
          console.error('Failed to disconnect from database: ' + err)
        }
      })
    }
  }
}

function getSecretValue(secretId) {
  return new Promise((resolve, reject) => {
    secrets.getSecretValue({ SecretId: secretId }, (err, data) => {
      if (err) {
        console.error('Error: Secret value retrieval failed: ' + err)
        return reject(err)
      }
      return resolve(JSON.parse(data.SecretString))
    })
  })
}

function sendCfnResponse(event, context, callback, physicalResourceId, error) {
  // Check if this a real CloudFormation invocation
  if (event.ResponseURL) {
    // Manually construct SUCCESS or FAILED response and send it back to AWS CloudFormation to avoid that
    // PhysicalResourceId defaults to a value that is different from request to request which causes resource
    // updates flipping into offending resource replacements
    const status = error ? response.FAILED : response.SUCCESS
    const data = error ? { Error: error.message || error.name || 'An unknown error occurred' } : {}
    response.send(event, context, status, data, physicalResourceId)

    // CloudFormation only marks the resource as failed if the Lambda function stays alive until the response
    // is sent. As cfn-response#send() is no async function using await does not work. We therefore must opt
    // for using the Lambda handler callback pattern.
    callback(error, 'OK') // If error is not null, the second parameter is ignored
  } else {
    // Only log error if any for local invocations or a test invocations from the AWS Lambda console
    if (error) {
      console.error(`Error: ${error.message}`)
    }
  }
}

async function createSchema(
  connection,
  appDatabaseName,
  appDatabaseUsername,
  userAuthentication,
) {
  console.log(`Creating app database "${appDatabaseName}"`)
  await query(
    connection,
    `CREATE DATABASE IF NOT EXISTS \`${appDatabaseName}\` CHARACTER SET utf8mb4;`,
  )

  console.log(`Creating app user "${appDatabaseUsername}"`)
  await query(
    connection,
    `CREATE user IF NOT EXISTS '${appDatabaseUsername}'@'%' ${userAuthentication};`,
  )

  console.log('Granting all app database privileges to app user')
  await query(connection, `GRANT ALL ON \`${appDatabaseName}\`.* to '${appDatabaseUsername}'@'%';`)

  console.log('Granting create user privileges to app user')
  await query(connection, `GRANT CREATE USER ON *.* TO '${appDatabaseUsername}'@'%' WITH GRANT OPTION;`)
}

async function deleteSchema(
  connection,
  appDatabaseName,
  appDatabaseUsername,
) {
  console.log(`Dropping app database "${appDatabaseName}"`)
  await query(connection, `drop database if exists \`${appDatabaseName}\`;`)

  console.log(`Dropping app user "${appDatabaseUsername}"`)
  await query(connection, `drop user if exists '${appDatabaseUsername}'@'%';`)
}

function query(connection, sql, logQuery = false) {
  if (logQuery) {
    console.log('Running query: ' + sql)
  }
  return new Promise((resolve, reject) => {
    connection.query(sql, (err, res) => {
      if (err) {
        console.error('Error: Query failed: ' + err)
        return reject(err)
      }
      return resolve(res)
    })
  })
}
