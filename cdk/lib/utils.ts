import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as core from 'aws-cdk-lib/core'
import * as customresources from 'aws-cdk-lib/custom-resources'
import { Construct } from 'constructs'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

export function computeStringHash(str: string): string {
  const hash = crypto.createHash('sha256')
  hash.write(str)
  return hash.digest('hex')
}

/**
 * Computes a combined hash of given files and folders. Used to conditionally deploy custom
 * resources depending on whether its source files have changed.
 * (see https://stackoverflow.com/a/74727589/2926305 and
 * https://stackoverflow.com/questions/68074935/hash-of-folders-in-nodejs for details)
 */
export function computeFileCollectionHash(files: string[], previousHash?: crypto.Hash): string {
  const combinedHash = previousHash ? previousHash : crypto.createHash('sha256')

  for (const file of files) {
    const statInfo = fs.statSync(file)
    if (statInfo.isDirectory()) {
      // Recursively walk over all files in subdirectory
      const children = fs.readdirSync(file, { withFileTypes: true }).map(entry => path.join(file, entry.name))
      computeFileCollectionHash(children, combinedHash)
    } else {
      // Update combined hash with file info composed of file name, file size, and file modification time
      const statInfo = fs.statSync(file)
      const fileInfo = `${file}:${statInfo.size}:${statInfo.mtimeMs}`
      combinedHash.update(fileInfo)
    }
  }

  // Retrieve and return digest of combined hash only if not being called recursively
  return !previousHash ? combinedHash.digest().toString('hex') : ''
}

export function createStringParameter(
  stack: cdk.Stack,
  name: string,
  value: string,
  update: boolean = true,
): void {
  const putStringParameterCall: customresources.AwsSdkCall = {
    service: 'SSM',
    action: 'putParameter',
    parameters: {
      Name: name,
      Value: value,
      Type: 'String',
      Overwrite: true,
    },
  }

  new customresources.AwsCustomResource(
    stack,
    `create-string-parameter-${computeStringHash(name)}-customresource`,
    {
      onCreate: {
        ...putStringParameterCall,
        physicalResourceId: customresources.PhysicalResourceId.of(
          `${stack.stackName}-create-${computeStringHash(name)}-string-parameter-call`,
        ),
      },
      onUpdate: update
        ? {
          ...putStringParameterCall,
          physicalResourceId: customresources.PhysicalResourceId.of(
            `${stack.stackName}-update-${computeStringHash(name)}-string-parameter-call`,
          ),
        }
        : undefined,
      policy: customresources.AwsCustomResourcePolicy.fromSdkCalls({
        resources: customresources.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      installLatestAwsSdk: true,
      logRetention: logs.RetentionDays.ONE_DAY,
    },
  )
}

export function createSecureStringParameter(
  stack: cdk.Stack,
  name: string,
  value: string,
  update: boolean = true,
): void {
  const putSecureStringParameterCall: customresources.AwsSdkCall = {
    service: 'SSM',
    action: 'putParameter',
    parameters: {
      Name: name,
      Value: value,
      Type: 'SecureString',
      Overwrite: true,
    },
  }

  new customresources.AwsCustomResource(
    stack,
    `create-secure-string-parameter-${computeStringHash(name)}-customresource`,
    {
      onCreate: {
        ...putSecureStringParameterCall,
        physicalResourceId: customresources.PhysicalResourceId.of(
          `${stack.stackName}-create-${computeStringHash(name)}-secure-string-parameter-call`,
        ),
      },
      onUpdate: update
        ? {
          ...putSecureStringParameterCall,
          physicalResourceId: customresources.PhysicalResourceId.of(
            `${stack.stackName}-update-${computeStringHash(name)}-secure-string-parameter-call`,
          ),
        }
        : undefined,
      policy: customresources.AwsCustomResourcePolicy.fromSdkCalls({
        resources: customresources.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      installLatestAwsSdk: true,
      logRetention: logs.RetentionDays.ONE_DAY,
    },
  )
}

export function peerVpcs(
  stack: cdk.Stack,
  sourceVpcName: string,
  sourceVpc: ec2.IVpc,
  targetVpcName: string,
  targetVpc: ec2.IVpc,
) {
  const peeringConnection = new ec2.CfnVPCPeeringConnection(
    stack,
    `${sourceVpcName}-${targetVpcName}-peering-connection`,
    {
      vpcId: sourceVpc.vpcId,
      peerVpcId: targetVpc.vpcId,
    },
  )

  // Allow access from public and private subnets of source VPC to target VPC
  sourceVpc.privateSubnets.forEach(({ routeTable: { routeTableId } }, index) => {
    new ec2.CfnRoute(stack, `${sourceVpcName}-${targetVpcName}-route-${index}`, {
      destinationCidrBlock: targetVpc.vpcCidrBlock,
      routeTableId,
      vpcPeeringConnectionId: peeringConnection.ref,
    })
  })
  targetVpc
    .selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED })
    .subnets.forEach(({ routeTable: { routeTableId } }, index) => {
      new ec2.CfnRoute(
        stack,
        `${targetVpcName}-${sourceVpcName}-route-${index}`,
        {
          destinationCidrBlock: sourceVpc.vpcCidrBlock,
          routeTableId,
          vpcPeeringConnectionId: peeringConnection.ref,
        },
      )
    })
}

interface FunctionProps {
  environment?: { [key: string]: string }
  vpc?: ec2.IVpc
  vpcSubnets?: ec2.SubnetSelection
  timeout?: core.Duration
}

export function createRustFunction(
  scope: Construct,
  id: string,
  functionName: string,
  binaryName: string,
  config: FunctionProps,
): lambda.Function {
  const rustLambdaBuildTarget = 'x86_64-unknown-linux-musl'

  const binFolder = path.join(
    __dirname,
    '..',
    '..',
    'lambda',
    'target',
    rustLambdaBuildTarget,
    'release',
  )
  const assetFolder = path.join(binFolder, binaryName)
  if (!fs.existsSync(assetFolder)) {
    fs.mkdirSync(assetFolder)
  }
  fs.copyFileSync(path.join(binFolder, `${binaryName}-lambda`), path.join(assetFolder, 'bootstrap'))

  const func = new lambda.Function(scope, id, {
    functionName,
    handler: 'main',
    runtime: lambda.Runtime.PROVIDED_AL2,
    code: lambda.Code.fromAsset(assetFolder),
    ...config,
  })

  return func
}

export function initializeLambdaEnvDeferred(
  stack: cdk.Stack,
  lambdaFunction: lambda.Function,
  environment: object,
): void {
  new customresources.AwsCustomResource(
    stack,
    `UpdateLambdaEnvironment-${lambdaFunction.node.id}-${
      computeStringHash(
        JSON.stringify(environment),
      )
    }`,
    {
      resourceType: 'Custom::UpdateLambdaEnvironment',
      onCreate: {
        region: stack.region,
        service: 'Lambda',
        action: 'updateFunctionConfiguration',
        parameters: {
          FunctionName: lambdaFunction.functionName,
          Environment: {
            Variables: environment,
          },
        },
        physicalResourceId: customresources.PhysicalResourceId.of(lambdaFunction.functionArn),
      },
      policy: customresources.AwsCustomResourcePolicy.fromSdkCalls({
        resources: customresources.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      installLatestAwsSdk: true,
      logRetention: logs.RetentionDays.ONE_DAY,
    },
  )
}

export function createOpenSearchVpcEndpoint(
  stack: cdk.Stack,
  eksVpc: ec2.IVpc,
  productionAccountId: string,
): void {
  new customresources.AwsCustomResource(
    stack,
    'opensearchVpcEndpointCustomResource',
    {
      onCreate: {
        region: stack.region,
        service: 'opensearch',
        action: 'CreateVpcEndpoint',
        parameters: {
          DomainArn: `arn:aws:es:${stack.region}:${productionAccountId}:domain/analyze-opensearch-2-domain`,
          VpcOptions: {
            SubnetIds: eksVpc.privateSubnets.map(subnet => subnet.subnetId),
          },
        },
        physicalResourceId: customresources.PhysicalResourceId.of('VpcEndpointId'),
      },
      policy: customresources.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: [
            'ec2:DescribeSubnets',
            'ec2:DescribeSecurityGroups',
            'ec2:CreateVpcEndpoint',
            'ec2:DescribeVpcEndpoints',
            'ec2:CreateTags',
            'es:CreateVpcEndpoint',
          ],
          resources: ['*'],
        }),
        // Add a specific statement for es:CreateVpcEndpoint scoped to the domain ARN
        new iam.PolicyStatement({
          actions: ['es:CreateVpcEndpoint'],
          resources: [`arn:aws:es:${stack.region}:${productionAccountId}:domain/analyze-opensearch-2-domain`], // Specific OpenSearch domain ARN
        }),
      ]),
      installLatestAwsSdk: true,
      logRetention: logs.RetentionDays.ONE_DAY,
    },
  )
}
