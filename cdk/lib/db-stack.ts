import { Stack, StackProps, RemovalPolicy, SecretValue, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DatabaseInstance, DatabaseInstanceEngine, MysqlEngineVersion, Credentials } from 'aws-cdk-lib/aws-rds';
import { Vpc, SubnetType, SecurityGroup, Port, Peer } from 'aws-cdk-lib/aws-ec2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export interface DbStackProps extends StackProps {
    vpc: ec2.Vpc;
    allowFromSgs?: ec2.ISecurityGroup[]; 
}

export class DbStack extends Stack {
    public readonly dbInstance: DatabaseInstance;
    public readonly dbSg: SecurityGroup;
    public readonly dbSecret: secretsmanager.ISecret;

    constructor(scope: Construct, id: string, props: DbStackProps) {
        super(scope, id, props);

        // читаем из env (НЕ попадает в git)
        const DB_USER = 'camunda';

        // создаём секрет в Secrets Manager двумя путями:
        //  - если CAMUNDA_DB_PASSWORD задан -> используем его
        //  - иначе генерируем пароль автоматически
        const dbSecret = new secretsmanager.Secret(this, 'CamundaDbSecret', {
                secretName: 'cortex-database-master-secret',
                generateSecretString: {
                    secretStringTemplate: JSON.stringify({ username: DB_USER }),
                    generateStringKey: 'password',
                    passwordLength: 20,
                    excludePunctuation: true,
                },
            });

        this.dbSecret = dbSecret;
        
        this.dbSg = new SecurityGroup(this, 'CamundaDbSg', {
            vpc: props.vpc,
            description: 'Allow EKS nodes to access MySQL',
            allowAllOutbound: true,
        });

        this.dbInstance = new DatabaseInstance(this, 'CamundaDb', {
            engine: DatabaseInstanceEngine.mysql({ version: MysqlEngineVersion.VER_8_0 }),
            vpc: props.vpc,
            vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
            credentials: Credentials.fromSecret(dbSecret),
            allocatedStorage: 20,
            instanceType: new ec2.InstanceType('t3.medium'),
            multiAz: false,
            publiclyAccessible: false,
            securityGroups: [this.dbSg],
            removalPolicy: RemovalPolicy.DESTROY, // учебный проект: да, в бою: SNAPSHOT
            databaseName: 'camunda',
        });

        // permanently allow MySQL from EKS cluster SG (and any extras you pass)
        for (const sg of props.allowFromSgs ?? []) {
            this.dbInstance.connections.allowFrom(sg, ec2.Port.tcp(3306), 'EKS - RDS MySQL');
        }

        new CfnOutput(this, 'DbSecretArn', { value: dbSecret.secretArn });
        new CfnOutput(this, 'DbEndpoint', { value: this.dbInstance.instanceEndpoint.hostname });

    }
}
