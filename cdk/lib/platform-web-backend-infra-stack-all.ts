import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import { Construct } from 'constructs'
import { Account } from './account'
import { ExternalResourcesBlock } from './external-resources-block'
import * as utils from './utils'

export class PlatformWebBackendInfraAllStack extends cdk.Stack {
  externalResources: ExternalResourcesBlock
  platformVpc: ec2.IVpc

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props)

    this.externalResources = new ExternalResourcesBlock(
      this,
      'external-resources-block',
    )

    // ECR can not be updated (only created) by CDK https://github.com/aws/aws-cdk/issues/5140
    // this.createContainerRepositories();
    this.createPlatformVpc()
    //this.createDatabaseInstance()
  }

  createContainerRepositories(): void {
    new ecr.Repository(this, 'platform-service-repository', {
      repositoryName: 'platform-service',
      imageTagMutability: ecr.TagMutability.MUTABLE,
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })
  }

  createPlatformVpc(): void {
    this.platformVpc = new ec2.Vpc(this, 'platform-vpc', {
      ipAddresses: ec2.IpAddresses.cidr(
        Account.isProduction(this.account) ? '10.24.0.0/16' : '10.15.0.0/16',
      ),
      vpcName: 'platform-vpc',
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 21,
          name: 'ingress',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 21,
          // FIXME Should be `isolated-subnet` according to naming scheme
          name: 'isolatedSubnet',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 21,
          name: 'compute',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    })

    // Allow database VPC to be reached from EKS VPC
    utils.peerVpcs(this, 'eks-vpc', this.externalResources.eksVpc, 'platform-vpc', this.platformVpc)
  }
}
