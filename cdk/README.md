# Welcome to your CDK TypeScript project

You should explore the contents of this project. It demonstrates a CDK app with an instance of a stack (`CdkStack`)
which contains an Amazon SQS queue that is subscribed to an Amazon SNS topic.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

## Todo after Eks stack is deployed 

- create oidc provider
- update VPC and oidc provided names in external resource block

````
export ACCOUNT_ID=676045246387
export REGION=eu-central-1
export CLUSTER_NAME=cortex-eks

aws eks update-kubeconfig --name cortex-eks --region eu-central-1
eksctl utils associate-iam-oidc-provider \
  --cluster cortex-eks \
  --region eu-central-1 \
  --approve

eksctl create iamserviceaccount \
  --cluster "$CLUSTER_NAME" \
  --namespace kube-system \
  --name aws-load-balancer-controller \
  --attach-policy-arn "$POLICY_ARN" \
  --override-existing-serviceaccounts \
  --region "$REGION" \
  --approve


export VPC_ID=$(aws eks describe-cluster --name "$CLUSTER_NAME" --region "$REGION" \
  --query "cluster.resourcesVpcConfig.vpcId" --output text)

vpc-081d7dce746ab2817

export VPC_ID=$(aws eks describe-cluster --name "$CLUSTER_NAME" --region "$REGION" \
  --query "cluster.resourcesVpcConfig.vpcId" --output text)

echo $VPC_ID

helm repo add eks https://aws.github.io/eks-charts
helm repo update

helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName="$CLUSTER_NAME" \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region="$REGION" \
  --set replicaCount=1 \
  --set vpcId="$VPC_ID"

kubectl -n kube-system get pods -l app.kubernetes.io/name=aws-load-balancer-controller

kubectl -n kube-system get deploy aws-load-balancer-controller
kubectl -n kube-system rollout status deploy/aws-load-balancer-controller
kubectl -n kube-system logs deploy/aws-load-balancer-controller | tail -n 50  

aws ec2 describe-vpcs --query "Vpcs[*].{ID:VpcId,CIDR:CidrBlock}" --output table

aws eks describe-cluster --name "$CLUSTER_NAME" --region "$REGION" \
  --query "cluster.identity.oidc.issuer" --output text

https://oidc.eks.eu-central-1.amazonaws.com/id/C95AC525CACA8B4AB4295EB4B430B655


````

## deploy external resource stack

`cdk deploy platform-web-backend-infra-all`

## deploy cortex all stack

`cdk deploy cortex-infra-all`

## deploy cortex stage

## deploy cortex dev


- bootstrap cluster:
  - `export GITHUB_TOKEN=ghp_IpxaPvz69U....`
  - `
    flux bootstrap github \
  --owner=maxitemis \
  --repository=cortex_private \
  --branch=main \
  --path=eks/clusters/cortex-eks \
  --personal \
  --namespace=flux-system
    `


````
kubectl delete secret cortex-db -n cortex-stage

kubectl create secret generic cortex-db \
--from-literal=DB_URL="jdbc:mysql://cortex.cx46wy8gajkf.eu-central-1.rds.amazonaws.com:3306/cortex-stage?autoReconnect=true&sessionVariables=transaction_isolation='READ-COMMITTED'" \
--from-literal=DB_USER="User-stage" \
--from-literal=DB_PASSWORD="4U4f(PVs|o(\!P2s\!Yd3ymoB0%<%fw&AU" \
-n cortex-stage


kubectl create secret generic cortex-db \
--from-literal=DB_URL="jdbc:mysql://cortex.cx46wy8gajkf.eu-central-1.rds.amazonaws.com:3306/cortex-dev?autoReconnect=true&sessionVariables=transaction_isolation='READ-COMMITTED'" \
--from-literal=DB_USER="User-dev" \
--from-literal=DB_PASSWORD="Jgn|%V*{I%#\!Xbf02}kiQF}+TyXYI0T0" \
-n cortex-dev


kubectl -n cortex-stage port-forward service/cortex-svc 8080:80
kubectl -n cortex-dev port-forward service/cortex-svc 8080:80
kubectl -n cortex-stage logs camunda-bc6bf4795-hklsl

````
