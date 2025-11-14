import * as cdk from 'aws-cdk-lib'
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as eks from 'aws-cdk-lib/aws-eks'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as route53 from 'aws-cdk-lib/aws-route53'
import { Construct } from 'constructs'
import { Account } from './account'

export class ExternalResourcesBlock extends Construct {
  stack: cdk.Stack
  //apigatewayPrincipal: iam.ServicePrincipal
  //hostedZone: route53.IHostedZone
  //networkLoadBalancer: elbv2.INetworkLoadBalancer
  //publicNetworkLoadBalancer: elbv2.INetworkLoadBalancer
  openIdConnectProvider: iam.IOpenIdConnectProvider
  defaultVpc: ec2.IVpc
  eksVpc: ec2.IVpc
  //comCertificate?: cdk.aws_certificatemanager.ICertificate

  constructor(scope: Construct, id: string) {
    super(scope, id)
    this.stack = cdk.Stack.of(scope)

    //this.defineServicePrincipals()
    this.defineGlobalResources()
  }

  //defineServicePrincipals(): void {
  //  this.apigatewayPrincipal = new iam.ServicePrincipal('apigateway.amazonaws.com')
  //}

  defineGlobalResources(): void {
  //  this.hostedZone = route53.HostedZone.fromLookup(
  //    this,
  //    'hosted-zone',
  //    {
  //      domainName: Account.isProduction(this.stack.account) ? 'ztools.org' : 'ztools.org',
  //    },
  //  )
//
  //  this.networkLoadBalancer = elbv2.NetworkLoadBalancer.fromNetworkLoadBalancerAttributes(
  //    this,
  //    'network-load-balancer',
  //    {
  //      loadBalancerArn: Account.isProduction(this.stack.account)
  //        ? `arn:aws:elasticloadbalancing:${this.stack.region}:${this.stack.account}:loadbalancer/net/a56cdf516a6f7401c9a0609a47478d97/5655b05230649305`
  //        : `arn:aws:elasticloadbalancing:${this.stack.region}:${this.stack.account}:loadbalancer/net/a5f702f4e566a40da88e2f4bcaafb814/5a1d3e38627ef2e4`,
  //      loadBalancerDnsName: Account.isProduction(this.stack.account)
  //        ? `a56cdf516a6f7401c9a0609a47478d97-5655b05230649305.elb.${this.stack.region}.amazonaws.com`
  //        : `a5f702f4e566a40da88e2f4bcaafb814-5a1d3e38627ef2e4.elb.${this.stack.region}.amazonaws.com`,
  //      loadBalancerCanonicalHostedZoneId: Account.isProduction(this.stack.account)
  //        ? 'Z3F0SRJ5LGBH90'
  //        : 'Z3F0SRJ5LGBH90',
  //    },
  //  )
//
  //  this.publicNetworkLoadBalancer = elbv2.NetworkLoadBalancer.fromNetworkLoadBalancerAttributes(
  //    this,
  //    'public-network-load-balancer',
  //    {
  //      loadBalancerArn: Account.isProduction(this.stack.account)
  //        ? `arn:aws:elasticloadbalancing:${this.stack.region}:${this.stack.account}:loadbalancer/net/aabe66b7ddd38473182056bba7578fe2/92e30c376738aac6`
  //        : `arn:aws:elasticloadbalancing:${this.stack.region}:${this.stack.account}:loadbalancer/net/aeb4d1cb796374839a60a33012281c43/8dd39f0b619c36b5`,
  //      loadBalancerDnsName: Account.isProduction(this.stack.account)
  //        ? `aabe66b7ddd38473182056bba7578fe2-92e30c376738aac6.elb.${this.stack.region}.amazonaws.com`
  //        : `aeb4d1cb796374839a60a33012281c43-8dd39f0b619c36b5.elb.${this.stack.region}.amazonaws.com`,
  //      loadBalancerCanonicalHostedZoneId: Account.isProduction(this.stack.account)
  //        ? 'Z3F0SRJ5LGBH90'
  //        : 'Z3F0SRJ5LGBH90',
  //    },
  //  )
//
    this.openIdConnectProvider = eks.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'openid-connect-provider',
      `arn:aws:iam::${this.stack.account}:oidc-provider/oidc.eks.eu-central-1.amazonaws.com/id/C95AC525CACA8B4AB4295EB4B430B655`,
    )

    this.defaultVpc = ec2.Vpc.fromLookup(this, 'default-vpc', {
      isDefault: true,
    })
//
    this.eksVpc = ec2.Vpc.fromLookup(this, 'eks-vpc', {
      vpcId: 'vpc-081d7dce746ab2817',
    })
//
  //  if (Account.isProduction(this.stack.account)) {
  //    this.comCertificate = certificatemanager.Certificate.fromCertificateArn(
  //      this,
  //      'api-cert-com',
  //      `arn:aws:acm:${this.stack.region}:679671425266:certificate/f6ed636e-698c-4a88-8498-d6b185f32d67`,
  //    )
  //  }
  }
}
