import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Cluster, KubernetesVersion, NodegroupAmiType } from 'aws-cdk-lib/aws-eks';
import { KubectlV32Layer } from '@aws-cdk/lambda-layer-kubectl-v32';
import { 
    Role, 
    ManagedPolicy, 
    ServicePrincipal, 
    PolicyStatement,
    Effect,
    PolicyDocument } from 'aws-cdk-lib/aws-iam';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface EksStackProps extends StackProps {
    vpc: ec2.Vpc;
    domainName: string;     // e.g. "operaton.ztools.org"
    hostedZoneId: string;   // Route53 Hosted Zone ID for the delegated zone
    certificateArn: string; // ACM cert for operaton.ztools.org (eu-central-1)
}


export class EksStack extends Stack {
    public readonly cluster: Cluster;
    public readonly clusterSg: ec2.ISecurityGroup;

    constructor(scope: Construct, id: string, props: EksStackProps) {
        super(scope, id, props);

        const adminPrincipalArn = 'arn:aws:iam::676045246387:user/max.starikov'; 
        const adminRole = iam.Role.fromRoleArn(this, 'CliAdminRole', adminPrincipalArn, { mutable: false });

        
        // role for EKS control plane to manage nodes
        const clusterAdminRole = new Role(this, 'ClusterAdminRole', {
            assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
            ],
        });

        const kubectlLayer = new KubectlV32Layer(this, 'KubectlLayer');

        this.cluster = new Cluster(this, 'CortexEks', {
            version: KubernetesVersion.V1_32,
            vpc: props.vpc,
            defaultCapacity: 0, // we'll define nodegroup ourselves
            clusterName: 'cortex-eks',
            kubectlLayer: kubectlLayer,
        });

        this.clusterSg = this.cluster.clusterSecurityGroup;

        const ng = this.cluster.addNodegroupCapacity('cortex-ng', {
            instanceTypes: [new ec2.InstanceType('t3.medium')],
            minSize: 2,
            maxSize: 4,
            amiType: NodegroupAmiType.AL2_X86_64,
            desiredSize: 2,
        });

        this.cluster.awsAuth.addMastersRole(clusterAdminRole);
        this.cluster.awsAuth.addMastersRole(adminRole);

        /*
        const albSa = this.cluster.addServiceAccount('AlbControllerSA', {
            name: 'aws-load-balancer-controller',
            namespace: 'kube-system',
        });
        
        // Минимально необходимая IAM-политика для ALB Controller (урезана по сервисам).
        // (В проде можно использовать полную политику из официальных примеров.)
        albSa.role.addManagedPolicy(
            ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy')
        );
        albSa.role.addToPrincipalPolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                'ec2:AuthorizeSecurityGroupIngress',
                'ec2:Describe*',
                'ec2:CreateSecurityGroup',
                'ec2:CreateTags',
                'ec2:DeleteSecurityGroup',
                'elasticloadbalancing:AddTags',
                'elasticloadbalancing:CreateListener',
                'elasticloadbalancing:CreateLoadBalancer',
                'elasticloadbalancing:CreateRule',
                'elasticloadbalancing:CreateTargetGroup',
                'elasticloadbalancing:DeleteListener',
                'elasticloadbalancing:DeleteLoadBalancer',
                'elasticloadbalancing:DeleteRule',
                'elasticloadbalancing:DeleteTargetGroup',
                'elasticloadbalancing:DeregisterTargets',
                'elasticloadbalancing:Describe*',
                'elasticloadbalancing:ModifyListener',
                'elasticloadbalancing:ModifyLoadBalancerAttributes',
                'elasticloadbalancing:ModifyRule',
                'elasticloadbalancing:ModifyTargetGroup',
                'elasticloadbalancing:ModifyTargetGroupAttributes',
                'elasticloadbalancing:RegisterTargets',
                'iam:CreateServiceLinkedRole',
                'cognito-idp:DescribeUserPoolClient',
                'waf-regional:GetWebACLForResource',
                'waf-regional:GetWebACL',
                'waf-regional:AssociateWebACL',
                'waf-regional:DisassociateWebACL',
                'wafv2:GetWebACLForResource',
                'wafv2:GetWebACL',
                'wafv2:AssociateWebACL',
                'wafv2:DisassociateWebACL',
                'tag:GetResources',
                'tag:TagResources',
                'shield:DescribeProtection',
                'shield:GetSubscriptionState',
                'shield:DeleteProtection',
                'shield:CreateProtection',
                'shield:DescribeSubscription',
                'shield:ListProtections',
            ],
            resources: ['*'],
        }));

        const albChart = this.cluster.addHelmChart('AwsLoadBalancerController', {
            repository: 'https://aws.github.io/eks-charts',
            chart: 'aws-load-balancer-controller',
            namespace: 'kube-system',
            release: 'aws-load-balancer-controller',
            values: {
                clusterName: this.cluster.clusterName,
                region: this.region,
                vpcId: props.vpc.vpcId,
                serviceAccount: {
                    create: false,
                    name: albSa.serviceAccountName,
                },
                // Для корректной аннотации HTTPS можно ничего не указывать здесь:
                // сертификат укажем непосредственно в Ingress-аннотации.
            },
            wait: true,
            timeout: Duration.minutes(15),
        });

        albChart.node.addDependency(ng);
        albChart.node.addDependency(albSa);
        */
        // ---------- external-dns ----------
        // IRSA для external-dns с доступом только к одной Hosted Zone
        /*
        const externalDnsSa = this.cluster.addServiceAccount('ExternalDnsSA', {
            name: 'external-dns',
            namespace: 'kube-system',
        });

        externalDnsSa.role.addToPrincipalPolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                'route53:ChangeResourceRecordSets',
            ],
            resources: [
                `arn:aws:route53:::hostedzone/${props.hostedZoneId}`,
            ],
        }));
        externalDnsSa.role.addToPrincipalPolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                'route53:ListHostedZones',
                'route53:ListResourceRecordSets',
            ],
            resources: ['*'],
        }));
        */

        /*
        // Ставим external-dns (исп. официальный/chart bitnami — стабильно и просто)
        const externalDnsChart = this.cluster.addHelmChart('ExternalDns', {
            repository: 'https://charts.bitnami.com/bitnami',
            chart: 'external-dns',
            namespace: 'kube-system',
            release: 'external-dns',
            values: {
                provider: 'aws',
                policy: 'upsert-only',
                txtOwnerId: `external-dns-${this.stackName}`,
                domainFilters: [props.domainName], // ограничиваемся одной зоной
                zoneType: 'public',
                serviceAccount: {
                    create: false,
                    name: externalDnsSa.serviceAccountName,
                },
                aws: {
                    region: this.region,
                },
                sources: ['ingress'], // достаточно смотреть на Ingress
            },
            wait: true,
            timeout: Duration.minutes(15),
        });

        externalDnsChart.node.addDependency(ng);
        externalDnsChart.node.addDependency(externalDnsSa);
        externalDnsChart.node.addDependency(albChart);
        */
    }
}
