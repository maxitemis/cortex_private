import * as cdk from 'aws-cdk-lib'

export enum Stage {
  dev = 'dev',
  stage = 'stage',
}

export interface StagedStackProps extends cdk.StackProps {
  readonly stage: Stage
}
