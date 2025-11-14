import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';

export interface DnsStackProps extends StackProps {
    /**
     * Имя поддомена, например "operaton.ztools.org"
     */
    domainName: string;
}

/**
 * Стек DNS и SSL-сертификата для operaton.ztools.org
 */
export class DnsStack extends Stack {
    public readonly certificateArn: string;
    public readonly hostedZoneIdOutput: string;
    
    
    constructor(scope: Construct, id: string, props: DnsStackProps) {
        super(scope, id, props);

        // Предполагаем, что Hosted Zone "operaton.ztools.org" уже создана в Route 53
        // (либо вручную, либо через aws route53 create-hosted-zone)
        const zone = HostedZone.fromLookup(this, 'OperatonZone', {
            domainName: props.domainName,
        });

        // Выпускаем сертификат ACM (используется для HTTPS в ALB/Ingress)
        const certificate = new Certificate(this, 'OperatonCert', {
            domainName: props.domainName,
            validation: CertificateValidation.fromDns(zone),
        });

        this.certificateArn = certificate.certificateArn;
        this.hostedZoneIdOutput = zone.hostedZoneId;
        
        // Экспортируем ARN сертификата, чтобы использовать в EKS ingress
        new CfnOutput(this, 'CertificateArn', {
            value: this.certificateArn,
            exportName: 'OperatonCertificateArn',
        });

        new CfnOutput(this, 'HostedZoneId', {
            value: zone.hostedZoneId,
            exportName: 'OperatonHostedZoneId',
        });
    }
}
