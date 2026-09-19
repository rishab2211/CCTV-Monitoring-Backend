# ==============================================================================
# CCTV Monitoring Backend — AWS Deployment Guide
# ==============================================================================
# Architecture: AWS ECS Fargate + ALB + ECR + SSM Parameter Store + CloudWatch
# Region: ap-south-1 (Mumbai) — change throughout if using a different region
# Estimated deploy time: 45-90 minutes for first deployment
# ==============================================================================

## Table of Contents

1. Prerequisites
2. Rotate Compromised Credentials  <-- DO THIS FIRST
3. Generate Secrets
4. MongoDB Atlas Setup
5. Build & Push Docker Image to ECR
6. IAM Roles Setup
7. VPC & Security Groups
8. SSM Parameter Store — Store All Secrets
9. ECS Cluster
10. Application Load Balancer
11. HTTPS Certificate (ACM)
12. Register ECS Task Definition
13. Create ECS Service
14. Custom Domain (Route 53)
15. CloudWatch Logs & Alarms
16. Auto Scaling
17. Post-Deployment Verification
18. Rollback Procedures
19. CI/CD with GitHub Actions
20. Cost Estimation
21. Quick Reference Commands

==============================================================================
## 1. Prerequisites
==============================================================================

Install required tools:

    # AWS CLI v2
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
    unzip awscliv2.zip && sudo ./aws/install

    # Docker (must be running)
    docker --version   # >= 24.x

    aws --version      # >= 2.x

Configure AWS CLI:

    aws configure
    # AWS Access Key ID:     <your IAM access key>
    # AWS Secret Access Key: <your IAM secret key>
    # Default region:        ap-south-1
    # Default output format: json

    # Verify
    aws sts get-caller-identity


==============================================================================
## 2. Rotate Compromised Credentials  (DO THIS FIRST)
==============================================================================

Your .env file contained real credentials committed to git. Rotate immediately:

  Service        | Action
  --------------------------------------------------------------------------
  MongoDB Atlas  | Database Access -> Edit user -> Change password
  Firebase       | GCP Console -> IAM -> Service Accounts -> Manage Keys ->
                 | Delete old key -> Add new key
  Cloudinary     | Settings -> Access Keys -> Regenerate API Secret
  Razorpay       | Account & Settings -> API Keys -> Regenerate
  JWT Secrets    | Generate new 48-byte secrets (see Step 3)


==============================================================================
## 3. Generate Secrets
==============================================================================

Run these locally to generate cryptographically secure secrets:

    openssl rand -hex 48   # -> ACCESS_TOKEN_SECRET
    openssl rand -hex 48   # -> REFRESH_TOKEN_SECRET
    openssl rand -hex 32   # -> SYSTEM_API_KEY
    openssl rand -hex 32   # -> MEDIAMTX_STREAM_SECRET

Save all values in a password manager before proceeding.


==============================================================================
## 4. MongoDB Atlas Setup
==============================================================================

ECS Fargate tasks get IPs from your VPC private subnets. Choose one:

OPTION A - VPC Peering (recommended):
  1. Atlas: Network Access -> Add Peering Connection -> AWS
  2. Enter AWS Account ID and VPC ID
  3. Accept peering request in AWS Console -> VPC -> Peering Connections
  4. Add Atlas CIDR to VPC route tables

OPTION B - NAT Gateway (+~$33/month):
  1. Create NAT Gateway in a public subnet
  2. Route private subnet traffic through NAT Gateway
  3. Add NAT Gateway Elastic IP to Atlas Network Access whitelist

OPTION C - Allow 0.0.0.0/0 (testing only, not for production):
  Atlas -> Network Access -> Add IP Address -> Allow Access From Anywhere

Connection string:
  mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/cctv_monitoring?retryWrites=true&w=majority


==============================================================================
## 5. Build & Push Docker Image to ECR
==============================================================================

    chmod +x aws/ecr-push.sh
    ./aws/ecr-push.sh                   # uses ap-south-1, tag: latest
    ./aws/ecr-push.sh ap-south-1 v1.0.0 # custom region and tag

The script auto-detects your account ID, authenticates Docker to ECR,
creates the repository if missing (with image scanning on push),
builds for linux/amd64 (required for Fargate), and pushes both tags.

Verify:
    aws ecr describe-images \
      --repository-name cctv-monitoring-backend \
      --region ap-south-1 \
      --query 'imageDetails[*].{Tag:imageTags[0],Pushed:imagePushedAt}' \
      --output table


==============================================================================
## 6. IAM Roles Setup
==============================================================================

### 6a. ECS Task Execution Role (allows ECS to pull ECR + read SSM secrets)

    aws iam create-role \
      --role-name ecsTaskExecutionRole \
      --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [{"Effect": "Allow",
          "Principal": {"Service": "ecs-tasks.amazonaws.com"},
          "Action": "sts:AssumeRole"}]
      }'

    aws iam attach-role-policy \
      --role-name ecsTaskExecutionRole \
      --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

    aws iam put-role-policy \
      --role-name ecsTaskExecutionRole \
      --policy-name CCTVSSMAccess \
      --policy-document '{
        "Version": "2012-10-17",
        "Statement": [{"Effect": "Allow",
          "Action": ["ssm:GetParameters","ssm:GetParameter",
                     "ssm:GetParametersByPath","kms:Decrypt"],
          "Resource": ["arn:aws:ssm:ap-south-1:*:parameter/cctv/prod/*"]}]
      }'

### 6b. ECS Task Role (permissions for the running app)

    aws iam create-role \
      --role-name cctvEcsTaskRole \
      --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [{"Effect": "Allow",
          "Principal": {"Service": "ecs-tasks.amazonaws.com"},
          "Action": "sts:AssumeRole"}]
      }'

    # If using AWS SES:
    aws iam attach-role-policy \
      --role-name cctvEcsTaskRole \
      --policy-arn arn:aws:iam::aws:policy/AmazonSESFullAccess


==============================================================================
## 7. VPC & Security Groups
==============================================================================

List VPCs:
    aws ec2 describe-vpcs \
      --query 'Vpcs[*].{ID:VpcId,CIDR:CidrBlock,Default:IsDefault}' --output table

ALB Security Group (internet-facing, allows HTTP + HTTPS):
    ALB_SG=$(aws ec2 create-security-group \
      --group-name cctv-alb-sg \
      --description "CCTV ALB" \
      --vpc-id vpc-XXXXXXXXXXXXXXXXX \
      --query GroupId --output text)

    aws ec2 authorize-security-group-ingress \
      --group-id $ALB_SG --protocol tcp --port 80 --cidr 0.0.0.0/0
    aws ec2 authorize-security-group-ingress \
      --group-id $ALB_SG --protocol tcp --port 443 --cidr 0.0.0.0/0

ECS Task Security Group (private, only ALB -> port 8080):
    ECS_SG=$(aws ec2 create-security-group \
      --group-name cctv-ecs-sg \
      --description "CCTV ECS Tasks" \
      --vpc-id vpc-XXXXXXXXXXXXXXXXX \
      --query GroupId --output text)

    aws ec2 authorize-security-group-ingress \
      --group-id $ECS_SG --protocol tcp --port 8080 --source-group $ALB_SG


==============================================================================
## 8. SSM Parameter Store — Store All Secrets
==============================================================================

    chmod +x aws/ssm-params.sh
    ./aws/ssm-params.sh

The interactive script prompts for each secret with hidden input.
19 SecureString parameters will be created under /cctv/prod/.

Verify:
    aws ssm get-parameters-by-path \
      --path /cctv/prod --region ap-south-1 \
      --query 'Parameters[*].Name' --output table


==============================================================================
## 9. ECS Cluster
==============================================================================

    aws ecs create-cluster \
      --cluster-name cctv-monitoring-cluster \
      --capacity-providers FARGATE FARGATE_SPOT \
      --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1 \
      --settings name=containerInsights,value=enabled \
      --region ap-south-1

    # Verify
    aws ecs describe-clusters \
      --clusters cctv-monitoring-cluster --region ap-south-1 \
      --query 'clusters[0].{Name:clusterName,Status:status}' --output table


==============================================================================
## 10. Application Load Balancer
==============================================================================

List subnets (need 2+ in different AZs):
    aws ec2 describe-subnets \
      --filters Name=vpc-id,Values=vpc-XXXXXXXXXXXXXXXXX \
      --query 'Subnets[*].{ID:SubnetId,AZ:AvailabilityZone,Public:MapPublicIpOnLaunch}' \
      --output table

Create ALB:
    ALB_ARN=$(aws elbv2 create-load-balancer \
      --name cctv-monitoring-alb \
      --subnets subnet-XXXXXXXXXXXXXXXXX subnet-XXXXXXXXXXXXXXXXX \
      --security-groups $ALB_SG \
      --scheme internet-facing --type application \
      --region ap-south-1 \
      --query 'LoadBalancers[0].LoadBalancerArn' --output text)

    aws elbv2 describe-load-balancers \
      --load-balancer-arns $ALB_ARN \
      --query 'LoadBalancers[0].DNSName' --output text

Create Target Group:
    TG_ARN=$(aws elbv2 create-target-group \
      --name cctv-api-tg --protocol HTTP --port 8080 \
      --target-type ip --vpc-id vpc-XXXXXXXXXXXXXXXXX \
      --health-check-path /health/live \
      --health-check-interval-seconds 30 \
      --health-check-timeout-seconds 10 \
      --healthy-threshold-count 2 \
      --unhealthy-threshold-count 3 \
      --matcher HttpCode=200 \
      --region ap-south-1 \
      --query 'TargetGroups[0].TargetGroupArn' --output text)

HTTP listener (redirects to HTTPS):
    aws elbv2 create-listener \
      --load-balancer-arn $ALB_ARN --protocol HTTP --port 80 \
      --default-actions Type=redirect,RedirectConfig='{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' \
      --region ap-south-1


==============================================================================
## 11. HTTPS Certificate (ACM)
==============================================================================

    CERT_ARN=$(aws acm request-certificate \
      --domain-name api.yourdomain.com \
      --subject-alternative-names "*.yourdomain.com" \
      --validation-method DNS --region ap-south-1 \
      --query CertificateArn --output text)

    # Get CNAME record to add to your DNS provider
    aws acm describe-certificate \
      --certificate-arn $CERT_ARN --region ap-south-1 \
      --query 'Certificate.DomainValidationOptions[0].ResourceRecord'

    # Wait for Status = ISSUED (check periodically)
    aws acm describe-certificate \
      --certificate-arn $CERT_ARN --region ap-south-1 \
      --query 'Certificate.Status' --output text

Create HTTPS listener once ISSUED:
    aws elbv2 create-listener \
      --load-balancer-arn $ALB_ARN --protocol HTTPS --port 443 \
      --certificates CertificateArn=$CERT_ARN \
      --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
      --default-actions Type=forward,TargetGroupArn=$TG_ARN \
      --region ap-south-1


==============================================================================
## 12. Register ECS Task Definition
==============================================================================

Replace YOUR_ACCOUNT_ID placeholder:
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    sed -i "s/YOUR_ACCOUNT_ID/${ACCOUNT_ID}/g" aws/task-definition.json

Register:
    aws ecs register-task-definition \
      --cli-input-json file://aws/task-definition.json --region ap-south-1

    aws ecs describe-task-definition \
      --task-definition cctv-monitoring-backend --region ap-south-1 \
      --query 'taskDefinition.{Family:family,Revision:revision,Status:status}' \
      --output table


==============================================================================
## 13. Create ECS Service
==============================================================================

Edit aws/ecs-service.json — replace:
  - "subnet-XXXXXXXXXXXXXXXXX"  -> your private subnet IDs
  - "sg-XXXXXXXXXXXXXXXXX"      -> $ECS_SG value
  - TARGET_GROUP_ARN placeholder -> $TG_ARN value

Create service:
    aws ecs create-service \
      --cli-input-json file://aws/ecs-service.json --region ap-south-1

Monitor until runningCount == desiredCount == 1:
    aws ecs describe-services \
      --cluster cctv-monitoring-cluster \
      --services cctv-monitoring-service --region ap-south-1 \
      --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}' \
      --output table


==============================================================================
## 14. Custom Domain (Route 53)
==============================================================================

    aws elbv2 describe-load-balancers \
      --load-balancer-arns $ALB_ARN \
      --query 'LoadBalancers[0].{DNS:DNSName,Zone:CanonicalHostedZoneId}' \
      --output table

    aws route53 change-resource-record-sets \
      --hosted-zone-id YOUR_HOSTED_ZONE_ID \
      --change-batch '{
        "Changes": [{"Action": "CREATE","ResourceRecordSet": {
          "Name": "api.yourdomain.com","Type": "A",
          "AliasTarget": {
            "HostedZoneId": "ALB_HOSTED_ZONE_ID",
            "DNSName": "ALB_DNS_NAME",
            "EvaluateTargetHealth": true
          }
        }}]
      }'


==============================================================================
## 15. CloudWatch Logs & Alarms
==============================================================================

Create log group (30-day retention):
    aws logs create-log-group \
      --log-group-name /ecs/cctv-monitoring-backend --region ap-south-1
    aws logs put-retention-policy \
      --log-group-name /ecs/cctv-monitoring-backend \
      --retention-in-days 30 --region ap-south-1

High error rate alarm (5XX > 10 in 5 minutes):
    aws cloudwatch put-metric-alarm \
      --alarm-name "CCTV-HighErrorRate" \
      --metric-name HTTPCode_Target_5XX_Count \
      --namespace AWS/ApplicationELB --statistic Sum \
      --period 300 --threshold 10 \
      --comparison-operator GreaterThanThreshold \
      --evaluation-periods 1 --treat-missing-data notBreaching \
      --region ap-south-1

Unhealthy host alarm:
    aws cloudwatch put-metric-alarm \
      --alarm-name "CCTV-UnhealthyHosts" \
      --metric-name UnHealthyHostCount \
      --namespace AWS/ApplicationELB --statistic Average \
      --period 60 --threshold 0 \
      --comparison-operator GreaterThanThreshold \
      --evaluation-periods 2 --region ap-south-1

Stream live logs:
    aws logs tail /ecs/cctv-monitoring-backend --follow --region ap-south-1


==============================================================================
## 16. Auto Scaling
==============================================================================

    aws application-autoscaling register-scalable-target \
      --service-namespace ecs \
      --scalable-dimension ecs:service:DesiredCount \
      --resource-id service/cctv-monitoring-cluster/cctv-monitoring-service \
      --min-capacity 1 --max-capacity 5 --region ap-south-1

    aws application-autoscaling put-scaling-policy \
      --policy-name cctv-cpu-scale-out \
      --service-namespace ecs \
      --scalable-dimension ecs:service:DesiredCount \
      --resource-id service/cctv-monitoring-cluster/cctv-monitoring-service \
      --policy-type TargetTrackingScaling \
      --target-tracking-scaling-policy-configuration '{
        "TargetValue": 70.0,
        "PredefinedMetricSpecification": {
          "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
        },
        "ScaleInCooldown": 300,
        "ScaleOutCooldown": 60
      }' --region ap-south-1


==============================================================================
## 17. Post-Deployment Verification
==============================================================================

    BASE_URL="https://api.yourdomain.com"

    curl -s $BASE_URL | python3 -m json.tool           # root ping
    curl -s $BASE_URL/health/live | python3 -m json.tool   # liveness
    curl -s $BASE_URL/api/v1/health | python3 -m json.tool # full health
    curl -I http://api.yourdomain.com                  # 301 -> HTTPS?
    wscat -c wss://api.yourdomain.com                  # WebSocket
    curl -I $BASE_URL/hls/cam-path/index.m3u8          # HLS proxy


==============================================================================
## 18. Rollback Procedures
==============================================================================

List recent task definition revisions:
    aws ecs list-task-definitions \
      --family-prefix cctv-monitoring-backend --region ap-south-1 \
      --query 'taskDefinitionArns[-5:]' --output table

Rollback to a specific revision:
    aws ecs update-service \
      --cluster cctv-monitoring-cluster \
      --service cctv-monitoring-service \
      --task-definition cctv-monitoring-backend:REVISION_NUMBER \
      --region ap-south-1

NOTE: The deployment circuit breaker (rollback=true in ecs-service.json)
automatically rolls back failed deployments to the last healthy revision.


==============================================================================
## 19. CI/CD with GitHub Actions
==============================================================================

Create .github/workflows/deploy.yml (replace YOUR_ACCOUNT_ID and YOUR_REPO):

    name: Deploy to AWS ECS
    on:
      push:
        branches: [main]
    env:
      AWS_REGION: ap-south-1
      ECR_REPOSITORY: cctv-monitoring-backend
      ECS_CLUSTER: cctv-monitoring-cluster
      ECS_SERVICE: cctv-monitoring-service
      CONTAINER_NAME: cctv-api
    jobs:
      deploy:
        runs-on: ubuntu-latest
        permissions:
          id-token: write
          contents: read
        steps:
          - uses: actions/checkout@v4
          - name: Configure AWS credentials (OIDC)
            uses: aws-actions/configure-aws-credentials@v4
            with:
              role-to-assume: arn:aws:iam::YOUR_ACCOUNT_ID:role/GitHubActionsDeployRole
              aws-region: ${{ env.AWS_REGION }}
          - name: Login to ECR
            id: login-ecr
            uses: aws-actions/amazon-ecr-login@v2
          - name: Build, tag, push image
            id: build-image
            env:
              ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
              IMAGE_TAG: ${{ github.sha }}
            run: |
              docker build --build-arg PORT=8080 --build-arg NODE_ENV=production \
                --platform linux/amd64 \
                -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG \
                -t $ECR_REGISTRY/$ECR_REPOSITORY:latest .
              docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
              docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest
              echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT
          - name: Download task definition
            run: |
              aws ecs describe-task-definition \
                --task-definition cctv-monitoring-backend \
                --query taskDefinition > task-def.json
          - name: Inject new image into task definition
            id: task-def
            uses: aws-actions/amazon-ecs-render-task-definition@v1
            with:
              task-definition: task-def.json
              container-name: ${{ env.CONTAINER_NAME }}
              image: ${{ steps.build-image.outputs.image }}
          - name: Deploy to ECS
            uses: aws-actions/amazon-ecs-deploy-task-definition@v1
            with:
              task-definition: ${{ steps.task-def.outputs.task-definition }}
              service: ${{ env.ECS_SERVICE }}
              cluster: ${{ env.ECS_CLUSTER }}
              wait-for-service-stability: true

Create GitHub OIDC IAM Role (no long-lived credentials in GitHub):
    aws iam create-role --role-name GitHubActionsDeployRole \
      --assume-role-policy-document '{
        "Version":"2012-10-17","Statement":[{"Effect":"Allow",
        "Principal":{"Federated":"arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"},
        "Action":"sts:AssumeRoleWithWebIdentity",
        "Condition":{"StringEquals":{"token.actions.githubusercontent.com:aud":"sts.amazonaws.com"},
          "StringLike":{"token.actions.githubusercontent.com:sub":"repo:YOUR_GITHUB_ORG/YOUR_REPO:*"}}}]}'

    aws iam attach-role-policy --role-name GitHubActionsDeployRole \
      --policy-arn arn:aws:iam::aws:policy/AmazonECS_FullAccess
    aws iam attach-role-policy --role-name GitHubActionsDeployRole \
      --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser


==============================================================================
## 20. Cost Estimation (ap-south-1, 1 Fargate task running 24/7)
==============================================================================

  Service                   | Monthly Cost
  ---------------------------------------------------
  ECS Fargate (1vCPU/2GB)   | ~$28
  Application Load Balancer  | ~$18
  ECR (5 GB storage)         | ~$0.50
  SSM Parameter Store (19)   | ~$0.38
  CloudWatch Logs (5 GB/mo)  | ~$2.50
  Data Transfer (10 GB out)  | ~$0.85
  NAT Gateway (if used)      | ~$33
  ACM HTTPS Certificate      | FREE
  MongoDB Atlas M0           | FREE
  ---------------------------------------------------
  TOTAL (without NAT)        | ~$50/month
  TOTAL (with NAT)           | ~$83/month

TIP: Use FARGATE_SPOT for up to 70% savings. Best alongside 1 on-demand task.


==============================================================================
## 21. Quick Reference Commands
==============================================================================

    # Force new deployment (after pushing a new image)
    aws ecs update-service \
      --cluster cctv-monitoring-cluster \
      --service cctv-monitoring-service \
      --force-new-deployment --region ap-south-1

    # List running tasks
    aws ecs list-tasks \
      --cluster cctv-monitoring-cluster \
      --service-name cctv-monitoring-service --region ap-south-1

    # Tail live logs
    aws logs tail /ecs/cctv-monitoring-backend --follow --region ap-south-1

    # Scale up to 2 tasks
    aws ecs update-service \
      --cluster cctv-monitoring-cluster \
      --service cctv-monitoring-service \
      --desired-count 2 --region ap-south-1

    # Get task private IP (for debugging)
    TASK=$(aws ecs list-tasks --cluster cctv-monitoring-cluster \
      --service-name cctv-monitoring-service \
      --query taskArns[0] --output text --region ap-south-1)
    aws ecs describe-tasks --cluster cctv-monitoring-cluster \
      --tasks $TASK --region ap-south-1 \
      --query 'tasks[0].containers[0].networkInterfaces[0].privateIpv4Address' \
      --output text

    # Rollback to previous revision
    aws ecs update-service \
      --cluster cctv-monitoring-cluster \
      --service cctv-monitoring-service \
      --task-definition cctv-monitoring-backend:REVISION_NUMBER \
      --region ap-south-1
