#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import {NetworkStack} from "../lib/network-stack";

const app = new cdk.App();

const env = { account: '676045246387', region: 'eu-central-1' };

const network = new NetworkStack(app, 'NetworkStack', { env });


