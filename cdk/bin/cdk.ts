#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import {NetworkStack} from "../lib/network-stack";
import {DnsStack} from "../lib/dns-stack";

const app = new cdk.App();

const env = { account: '676045246387', region: 'eu-central-1' };

const network = new NetworkStack(app, 'NetworkStack', { env });

const dns1 = new DnsStack(app, 'DnsStageStack', {
    domainName: 'cortex.syngit.de',
    devDomainName: 'cortex.dev.syngit.de',
    env,
});

// const dns2 = new DnsStack(app, 'DnsDevStack', {
//     domainName: 'cortexdev.syngit.de',
//     env,
// });

