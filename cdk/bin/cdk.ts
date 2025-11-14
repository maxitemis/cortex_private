#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import {NetworkStack} from "../lib/network-stack";
import {DnsStack} from "../lib/dns-stack";
import {EksStack} from "../lib/eks-stack";
import {CortexInfraAllStack} from "../lib/cortex-infra-stack-all";
import {PlatformWebBackendInfraAllStack} from "../lib/platform-web-backend-infra-stack-all";
import {Account} from "../lib/account";
import {CortexInfraStack} from "../lib/cortex-infra-stack";
import {Stage} from "../lib/stage";

const app = new cdk.App();

const env = { account: '676045246387', region: 'eu-central-1' };

const network = new NetworkStack(app, 'NetworkStack', { env });

const dns = new DnsStack(app, 'DnsStageStack', {
    domainName: 'cortex.syngit.de',
    devDomainName: 'cortex.dev.syngit.de',
    env,
});

const eks = new EksStack(app, 'EksStack', {
    vpc: network.vpc,
    env,
});

const platformAllStack = new PlatformWebBackendInfraAllStack(
    app,
    'platform-web-backend-infra-all',
    {
        env: env,
    },
)

const cortexAllStack = new CortexInfraAllStack(app, 'cortex-infra-all', {
    env: env,
    platformVpc: platformAllStack.platformVpc,
})


for (const stage of Account.getStages(env.account)) {
    console.log(
        `Processing deployments to '${stage}' stage in '${env.region}:${env.account}' environment`,
    )


        // for now only stage and prod are needed
        new CortexInfraStack(app, `cortex-infra-${stage}`, {
            env: env,
            stage,
            databaseBlock: cortexAllStack.databaseBlock,
            //ciAgentGpgSecretKeyParameterAccessPolicy: clusterAllStack.ciAgentGpgSecretKeyParameterAccessPolicy,
            //slackAlertsWebhookUrlParameterAccessPolicy:
            //    clusterAllStack.slackAlertsWebhookUrlParameterAccessPolicies['cortex'],
        })
    
}
