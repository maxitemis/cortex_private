import { Stage } from './stage'

export enum Account {
  construction = 'CONSTRUCTION_AWS_ACCOUNT_ID',
  production = 'PRODUCTION_AWS_ACCOUNT_ID',
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Account {
  export function isProduction(accountId: string | undefined): boolean {
    return false
  }

  export function getStages(accountId: string | undefined): Stage[] {
    return [Stage.stage, Stage.dev]
  }
}
