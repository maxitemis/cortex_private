import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as sm from 'aws-cdk-lib/aws-secretsmanager'
import { Environment } from 'aws-cdk-lib/core/lib/environment'
import * as customresources from 'aws-cdk-lib/custom-resources'
import { Construct } from 'constructs'
import { DatabaseBlock } from './cortex/database-block'
import { ExternalResourcesBlock } from './external-resources-block'
import { FluxServiceAccountRolesBlock } from './flux-service-account-roles-block'
import { Stage, StagedStackProps } from './stage'

export interface CortexInfraProps extends StagedStackProps {
  databaseBlock: DatabaseBlock
  ciAgentGpgSecretKeyParameterAccessPolicy: iam.ManagedPolicy
  slackAlertsWebhookUrlParameterAccessPolicy: iam.ManagedPolicy
  env: Environment
}

export class CortexInfraStack extends cdk.Stack {
  stage: Stage
  externalResources: ExternalResourcesBlock
  databaseUserSecret: sm.Secret

  appDatabaseName: string
  appDatabaseUsername: string
  tenantSchemaPrefix: string

  constructor(scope: Construct, id: string, props: CortexInfraProps) {
    super(scope, id, props)
    this.stage = props.stage

    cdk.Tags.of(this).add('product', 'cortex')
    cdk.Tags.of(this).add('stage', this.stage)

    this.externalResources = new ExternalResourcesBlock(
      this,
      'external-resources-block',
    )

    this.appDatabaseName = `cortex-${this.stage}`
    this.appDatabaseUsername = this.appDatabaseName
    this.tenantSchemaPrefix = `tenant-${this.stage}`

    this.createAppDatabaseUserSecret()
    this.createServiceAccountRoles(props)
    this.createDatabaseInitializerCall(props)
  }

  createAppDatabaseUserSecret(): void {
    const secretId = `cortex-database-user-secret-${this.stage}`

    this.databaseUserSecret = new sm.Secret(this, secretId, {
      secretName: secretId,
      generateSecretString: {
        // Constraints for MySQL password and RDS format
        excludeCharacters: '@/" ',
        generateStringKey: 'password',
        passwordLength: 32,
        secretStringTemplate: JSON.stringify({ username: `User-${this.stage}` }),
      },
    })
  }

  createServiceAccountRoles(props: CortexInfraProps): void {
    new FluxServiceAccountRolesBlock(this, 'flux-service-account-roles-block', {
      stage: this.stage,
      appGroupName: 'cortex',
      openIdConnectProvider: this.externalResources.openIdConnectProvider,
      ciAgentGpgSecretKeyParameterAccessPolicy: props.ciAgentGpgSecretKeyParameterAccessPolicy,
      slackAlertsWebhookUrlParameterAccessPolicy: props.slackAlertsWebhookUrlParameterAccessPolicy,
    })

    const secretManagerAccessPolicy = new iam.Policy(this, 'secret-manager-access-policy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            `arn:aws:secretsmanager:${props.env.region}:${props.env.account}:secret:cortex-database-app-secret-${this.stage}*`,
            `arn:aws:secretsmanager:${props.env.region}:${props.env.account}:secret:cortex-database-secret-*`,
          ],
          resources: ['*'],
        }),
      ],
    })

    const serviceAccountRole = new iam.Role(this, 'sa-role', {
      roleName: `eks-cortex-sa-${this.stage}`,
      assumedBy: new iam.FederatedPrincipal(
        this.externalResources.openIdConnectProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            [`${this.externalResources.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com',
            [`${this.externalResources.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]:
              `system:serviceaccount:cortex-${this.stage}:cortex-sa`,
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    })

    serviceAccountRole.attachInlinePolicy(secretManagerAccessPolicy)

    new cdk.CfnOutput(this, 'service-account-role-arn', {
      key: 'cortexServiceAccountRoleArn',
      value: serviceAccountRole.roleArn || 'unknown',
      exportName: `cortex-service-account-role-arn-${this.stage}`,
    })
  }

  // Database initialization inspired by https://aws.amazon.com/blogs/infrastructure-and-automation/use-aws-cdk-to-initialize-amazon-rds-instances
  createDatabaseInitializerCall(props: CortexInfraProps): void {
    const functionProvider = new customresources.Provider(
      this,
      'cortex-database-initializer-function-provider',
      {
        onEventHandler: props.databaseBlock.databaseInitializerFunction,
        logRetention: logs.RetentionDays.ONE_DAY,
      },
    )

    new cdk.CustomResource(
      this,
      'cortex-database-initializer-function-resource',
      {
        serviceToken: functionProvider.serviceToken,
        properties: {
          databaseHost: props.databaseBlock.databaseInstance.dbInstanceEndpointAddress,
          databaseSecretName: props.databaseBlock.databaseSecret.secretName,
          appDatabaseName: this.appDatabaseName,
          appDatabaseUsername: this.appDatabaseUsername,
          appDatabaseSecretName: this.databaseUserSecret.secretName,
          tenantSchemaPrefix: this.tenantSchemaPrefix,
          stage: props.stage,
          updateIndicator: props.databaseBlock.databaseInitializerFunctionChangeIndicator,
        },
      },
    )
  }
}
