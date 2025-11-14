import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import { Stage } from './stage'

export interface FluxServiceAccountRolesBlockProps {
  stage: Stage
  appGroupName: string
  openIdConnectProvider: iam.IOpenIdConnectProvider
  ciAgentGpgSecretKeyParameterAccessPolicy: iam.ManagedPolicy
  slackAlertsWebhookUrlParameterAccessPolicy: iam.ManagedPolicy
}

export class FluxServiceAccountRolesBlock extends Construct {
  constructor(scope: Construct, id: string, props: FluxServiceAccountRolesBlockProps) {
    super(scope, id)

    this.createEcrCredentialsServiceAccountRole(props)
    this.createCiAgentGpgSecretKeyServiceAccountRole(props)
    this.createFluxAlertsServiceAccountRole(props)
  }

  createEcrCredentialsServiceAccountRole(props: FluxServiceAccountRolesBlockProps): void {
    const serviceAccountRole = new iam.Role(
      this,
      `eks-${props.appGroupName}-ecr-credentials-sa`,
      {
        roleName: `eks-${props.appGroupName}-ecr-credentials-sa-${props.stage}`,
        assumedBy: new iam.FederatedPrincipal(
          props.openIdConnectProvider.openIdConnectProviderArn,
          {
            StringEquals: {
              [`${props.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com',
              [`${props.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]:
                `system:serviceaccount:${props.appGroupName}-${props.stage}:ecr-credentials-sa`,
            },
          },
          'sts:AssumeRoleWithWebIdentity',
        ),
      },
    )
    serviceAccountRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
    )
  }

  createCiAgentGpgSecretKeyServiceAccountRole(props: FluxServiceAccountRolesBlockProps) {
    const serviceAccountRole = new iam.Role(
      this,
      `eks-${props.appGroupName}-ci-agent-gpg-secret-key-sa-role`,
      {
        roleName: `eks-${props.appGroupName}-ci-agent-gpg-secret-key-sa-${props.stage}`,
        assumedBy: new iam.FederatedPrincipal(
          props.openIdConnectProvider.openIdConnectProviderArn,
          {
            StringEquals: {
              [`${props.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com',
              [`${props.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]:
                `system:serviceaccount:${props.appGroupName}-${props.stage}:ci-agent-gpg-secret-key-sa`,
            },
          },
          'sts:AssumeRoleWithWebIdentity',
        ),
      },
    )
    serviceAccountRole.addManagedPolicy(props.ciAgentGpgSecretKeyParameterAccessPolicy)
  }

  createFluxAlertsServiceAccountRole(props: FluxServiceAccountRolesBlockProps): void {
    const serviceAccountRole = new iam.Role(
      this,
      `eks-${props.appGroupName}-flux-alerts-sa-role`,
      {
        roleName: `eks-${props.appGroupName}-flux-alerts-sa-${props.stage}`,
        assumedBy: new iam.FederatedPrincipal(
          props.openIdConnectProvider.openIdConnectProviderArn,
          {
            StringEquals: {
              [`${props.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com',
              [`${props.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]:
                `system:serviceaccount:${props.appGroupName}-${props.stage}:${props.appGroupName}-flux-alerts-sa`,
            },
          },
          'sts:AssumeRoleWithWebIdentity',
        ),
      },
    )
    serviceAccountRole.addManagedPolicy(props.slackAlertsWebhookUrlParameterAccessPolicy)
  }
}
