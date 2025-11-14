import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Cluster, KubernetesVersion, NodegroupAmiType } from 'aws-cdk-lib/aws-eks';
import { KubectlV32Layer } from '@aws-cdk/lambda-layer-kubectl-v32';
import { 
    Role, 
    ManagedPolicy, 
    ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface EksStackProps extends StackProps {
    vpc: ec2.Vpc;
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
    }
}
