import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { Architecture } from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as sm from 'aws-cdk-lib/aws-secretsmanager'
import { Environment } from 'aws-cdk-lib/core/lib/environment'
import { Construct } from 'constructs'
import * as path from 'path'
import { Account } from '../account'
import * as utils from '../utils'

export interface DatabaseBlockProps {
  databaseVpc: ec2.IVpc
  inboundCidrBlock: ec2.IPeer
  databasePort: number
  env: Environment
}

export class DatabaseBlock extends Construct {
  stack: cdk.Stack

  databaseSecret: sm.Secret
  databaseInstance: rds.DatabaseInstance
  databaseInitializerFunction: lambda.IFunction
  databaseInitializerFunctionChangeIndicator: string

  constructor(scope: Construct, id: string, props: DatabaseBlockProps) {
    super(scope, id)
    this.stack = cdk.Stack.of(scope)

    this.createDatabaseSecret()
    this.createDatabaseInstance(props)
    this.createDatabaseInitializerFunction(props)
  }

  createDatabaseSecret(): void {
    this.databaseSecret = new sm.Secret(this, 'cortex-database-secret', {
      secretName: 'cortex-database-secret',
      generateSecretString: {
        // Constraints for MySQL master password and RDS format
        excludeCharacters: '@/" ',
        generateStringKey: 'password',
        passwordLength: 32,
        secretStringTemplate: JSON.stringify({ username: 'Admin' }),
      },
    })
  }

  createDatabaseInstance(props: DatabaseBlockProps): void {
    // Create database security group and configure inbound rules
    const databaseSecurityGroup = new ec2.SecurityGroup(this, 'database-security-group', {
      vpc: props.databaseVpc,
      allowAllOutbound: false, // Disabled outbound rules
    })
    databaseSecurityGroup.addIngressRule(props.inboundCidrBlock, ec2.Port.tcp(props.databasePort))

    this.databaseInstance = new rds.DatabaseInstance(this, 'database-instance', {
      instanceIdentifier: 'cortex',
      databaseName: 'cortex',
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0, // TODO: version 9?
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
      vpc: props.databaseVpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      storageEncrypted: true,
      multiAz: false,
      iamAuthentication: true,
      autoMinorVersionUpgrade: false,
      allocatedStorage: 20,
      publiclyAccessible: false,
      storageType: rds.StorageType.GP2,
      backupRetention: cdk.Duration.days(Account.isProduction(this.stack.account) ? 30 : 7),
      deletionProtection: Account.isProduction(this.stack.account) ? true : false,
      credentials: rds.Credentials.fromSecret(this.databaseSecret),
      port: props.databasePort,
      securityGroups: [databaseSecurityGroup],
      cloudwatchLogsExports: Account.isProduction(this.stack.account)
        ? ['error', 'general', 'slowquery', 'audit']
        : undefined,
      cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH,
    })
  }

  createDatabaseInitializerFunction(props: DatabaseBlockProps): void {
    const databaseInitializerSecurityGroup = new ec2.SecurityGroup(
      this,
      'database-initializer-security-group',
      {
        securityGroupName: 'cortex-database-initializer',
        vpc: props.databaseVpc,
        allowAllOutbound: true,
      },
    )

    const functionFolder = path.join(__dirname, 'database-init-function/docker')
    const functionFiles = [
      'index.js',
      'package.json',
      'Dockerfile',
    ].map(file => path.join(functionFolder, file))

    this.databaseInitializerFunction = new lambda.DockerImageFunction(
      this,
      'database-initializer-function',
      {
        functionName: 'cortex-database-initializer',
        code: lambda.DockerImageCode.fromImageAsset(functionFolder),
        memorySize: 128,
        vpc: props.databaseVpc,
        vpcSubnets: props.databaseVpc.selectSubnets({
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }),
        securityGroups: [databaseInitializerSecurityGroup],
        timeout: cdk.Duration.minutes(10),
        logRetention: logs.RetentionDays.FIVE_MONTHS,
        architecture: Architecture.X86_64, // to be able to build on M1 mac
      },
    )
    this.databaseInitializerFunctionChangeIndicator = utils.computeFileCollectionHash(functionFiles)

    const secretArnPattern =
      `arn:aws:secretsmanager:${props.env.region}:${props.env.account}:secret:cortex-database-app-secret-*`
    this.databaseInitializerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'secretsmanager:GetSecretValue',
          'secretsmanager:DescribeSecret',
        ],
        resources: [secretArnPattern],
      }),
    )

    // Allow the initializer function to connect to database instance
    this.databaseInstance.connections.allowFrom(
      this.databaseInitializerFunction,
      ec2.Port.tcp(props.databasePort),
    )

    // Allow initializer function to read database instance credentials secret
    this.databaseSecret.grantRead(this.databaseInitializerFunction)
  }
}
