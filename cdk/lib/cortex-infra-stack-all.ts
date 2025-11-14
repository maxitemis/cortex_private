import * as cdk from 'aws-cdk-lib'
import { StackProps } from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import { CortexInfraProps } from './cortex-infra-stack'
import { DatabaseBlock } from './cortex/database-block'
import { ExternalResourcesBlock } from './external-resources-block'
import { FluxServiceAccountRolesBlock } from './flux-service-account-roles-block'

export interface CortexInfraAllStackProps extends StackProps {
  platformVpc: ec2.IVpc
}

export class CortexInfraAllStack extends cdk.Stack {
  externalResources: ExternalResourcesBlock
  databaseBlock: DatabaseBlock
  platformVpc: ec2.IVpc

  constructor(scope: Construct, id: string, props: CortexInfraAllStackProps) {
    super(scope, id, props)

    cdk.Tags.of(this).add('product', 'cortex')
    cdk.Tags.of(this).add('stage', 'all')

    this.externalResources = new ExternalResourcesBlock(
      this,
      `external-resources-block`,
    )

    this.platformVpc = props.platformVpc
    this.databaseBlock = this.createDatabaseInstance(props)
  }
  
  createDatabaseInstance(props: cdk.StackProps): DatabaseBlock {
    const databaseBlock = new DatabaseBlock(this, 'cortex-database', {
      databaseVpc: this.platformVpc,
      inboundCidrBlock: ec2.Peer.ipv4(this.externalResources.eksVpc.vpcCidrBlock),
      databasePort: 3306,
      env: props.env!,
    })

    new cdk.CfnOutput(this, 'database-instance-id-output', {
      key: 'cortexDatabaseInstanceId',
      value: databaseBlock.databaseInstance.instanceIdentifier,
      exportName: 'cortex-database-instance-id',
    })
    new cdk.CfnOutput(this, 'database-instance-resource-id-output', {
      key: 'cortexDatabaseInstanceResourceId',
      value: databaseBlock.databaseInstance.instanceResourceId || 'unknown',
      exportName: 'cortex-database-instance-resource-id',
    })
    new cdk.CfnOutput(this, 'database-instance-endpoint-hostname-output', {
      key: 'cortexDatabaseInstanceEndpointHostname',
      value: databaseBlock.databaseInstance.instanceEndpoint.hostname,
      exportName: 'cortex-database-instance-endpoint-hostname',
    })
    return databaseBlock
  }
}
