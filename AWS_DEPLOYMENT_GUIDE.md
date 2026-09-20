================================================================================
CCTV Monitoring Backend — AWS Console Deployment Guide
================================================================================
Deploy via the AWS web dashboard, step by step.
Only Step 5 (Docker build + push) requires your terminal.
Everything else is done through the AWS Console at console.aws.amazon.com
================================================================================

TABLE OF CONTENTS
  1.  Leave AWS Organization (fixes the ECR block)
  2.  Rotate Your Leaked AWS Credentials
  3.  Set Up the IAM User Properly
  4.  Create the ECR Repository
  5.  Build & Push Docker Image  ← only terminal step
  6.  Create SSM Parameter Store Secrets
  7.  Create IAM Roles for ECS
  8.  Create Security Groups
  9.  Create the Application Load Balancer & Target Group
  10. Request an HTTPS Certificate (ACM)
  11. Attach HTTPS Listener to the ALB
  12. Create the ECS Cluster
  13. Create the ECS Task Definition
  14. Create the ECS Service
  15. Point Your Domain to the ALB
  16. Create CloudWatch Alarms
  17. Verify the Deployment
  18. Set Up Auto-Scaling
  19. CI/CD with GitHub Actions
  20. Cost Overview


================================================================================
STEP 1 — Leave AWS Organization
(This removes the SCP that blocks ECR and other services)
================================================================================

You must log in as the ROOT user of account 437608339995 — not the IAM user.

1. Go to:  https://console.aws.amazon.com
2. Click "Sign in to a different account" if you're already logged in
3. On the sign-in page, click "Sign in as root user"
4. Enter the EMAIL ADDRESS you used to create the AWS account
5. Enter the root account password
   (If forgotten: click "Forgot password" on the login page)

Once logged in as root:
6. In the top search bar, type "Organizations" → click "AWS Organizations"
7. You will see a yellow banner: "Your account is a member of an organization"
8. Click the "Leave organization" button
9. In the confirmation dialog, type "leave" and click "Leave organization"

Done. Your account is now standalone — no more SCP restrictions.

Sign out from root after this step.


================================================================================
STEP 2 — Rotate Your Leaked AWS Credentials
================================================================================

The Access Key you pasted in chat is now compromised. Rotate it immediately.

1. Go to: https://console.aws.amazon.com/iam/home#/users/cctv-monitoring-demo
2. Click the "Security credentials" tab
3. Under "Access keys" → find "AKIAWLY35LIN..." → click "Actions" → "Deactivate"
4. Then click "Actions" → "Delete"
5. Click "Create access key"
   - Use case: "Command Line Interface (CLI)"
   - Click "Next" → "Create access key"
6. Download the CSV or copy the new Key ID and Secret
7. Update your local AWS CLI config:

   Open a terminal and run:
     aws configure
   Enter the new Access Key ID and Secret when prompted.


================================================================================
STEP 3 — Set Up the IAM User Properly
================================================================================

(If you already did this from the earlier guide, verify it here.)

1. Go to: https://console.aws.amazon.com/iam/home#/users/cctv-monitoring-demo
2. Click "Permissions" tab
3. Click "Add permissions" → "Attach policies directly"
4. Search and check each of these policies:
   ✓ AdministratorAccess
5. Click "Next" → "Add permissions"

Note: AdministratorAccess is fine for a personal project. For production at a
company you'd want a scoped policy. For now this gets you unblocked.


================================================================================
STEP 4 — Create the ECR Repository
================================================================================

ECR (Elastic Container Registry) stores your Docker image.

1. Go to: https://ap-southeast-2.console.aws.amazon.com/ecr/home
   (Make sure region shows "Asia Pacific (Mumbai) ap-southeast-2" in top-right)

2. Click "Create repository"

3. Fill in:
   Repository name:  cctv-monitoring-backend
   Visibility:       Private
   Image scan:       ✓ Enable "Scan on push"  (finds vulnerabilities)
   Encryption:       AES-256 (default)

4. Click "Create repository"

5. Click into the repository → click "View push commands" (top right)
   → copy and save the push commands shown — you'll use them in Step 5.


================================================================================
STEP 5 — Build & Push Docker Image  (terminal required)
================================================================================

This is the only step that needs your terminal and Docker desktop running.

Open a terminal in your project folder:
  cd ~/Personal/WebDev/CCTV\ Monitoring\ Backend

Run the push script (uses your newly configured AWS CLI credentials):
  chmod +x aws/ecr-push.sh
  ./aws/ecr-push.sh ap-southeast-2 latest

The script will:
  - Log Docker into ECR
  - Build the image for linux/amd64 (required for Fargate)
  - Push the image to the repository created in Step 4

Verify it worked:
  Go back to ECR → cctv-monitoring-backend → "Images" tab
  You should see an image tagged "latest" with a recent push timestamp.


================================================================================
STEP 6 — Create SSM Parameter Store Secrets
================================================================================

All your production secrets live here — never in the Docker image or task def.

1. Go to: https://ap-southeast-2.console.aws.amazon.com/systems-manager/parameters

2. For EACH secret below, click "Create parameter" and fill in:
   Tier:        Standard
   Type:        SecureString
   KMS key:     alias/aws/ssm  (default)

   Create these 19 parameters (Name → Value):

   /cctv/prod/MONGODB_URI
     → mongodb+srv://user:newpassword@cluster.mongodb.net/cctv_monitoring

   /cctv/prod/ACCESS_TOKEN_SECRET
     → (the 96-char hex string from: openssl rand -hex 48)
     → a4412a7875c65d5781236631fc3bc77bbe83c257821fc784...  (your generated value)

   /cctv/prod/REFRESH_TOKEN_SECRET
     → (the second 96-char hex string you generated)
     → 4dfbe63c7086e1711b89922a06b9c585b5285a482d1aa872...

   /cctv/prod/SYSTEM_API_KEY
     → 473f657b90293419bbd476da260240df28dcdc064dd4aa963a40a093a371949f

   /cctv/prod/MEDIAMTX_STREAM_SECRET
     → 8b97183936f4804cf6430f7c3e0045ad68c306f9a17eb8b4f372adcbd7bec4a4

   /cctv/prod/SMTP_HOST
     → smtp.gmail.com

   /cctv/prod/SMTP_USER
     → your Gmail address

   /cctv/prod/SMTP_PASS
     → your Gmail App Password (16-char, get from myaccount.google.com/apppasswords)

   /cctv/prod/EMAIL_FROM
     → CCTV Monitor <noreply@yourdomain.com>

   /cctv/prod/CLOUDINARY_CLOUD_NAME
     → your Cloudinary cloud name

   /cctv/prod/CLOUDINARY_API_KEY
     → your Cloudinary API key

   /cctv/prod/CLOUDINARY_API_SECRET
     → your NEW Cloudinary API secret (regenerated)

   /cctv/prod/FIREBASE_PROJECT_ID
     → your Firebase project ID

   /cctv/prod/FIREBASE_CLIENT_EMAIL
     → firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

   /cctv/prod/FIREBASE_PRIVATE_KEY
     → the full PEM string from the NEW Firebase service account key JSON
     → paste the entire -----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
     → (replace literal \n with actual newlines when pasting)

   /cctv/prod/RAZORPAY_KEY_ID
     → rzp_live_xxxxxxxx  (regenerated key)

   /cctv/prod/RAZORPAY_KEY_SECRET
     → your new Razorpay secret

   /cctv/prod/CORS_ORIGIN
     → https://yourdomain.com,https://app.yourdomain.com
     → (for now while testing: https://yourdomain.com)

   /cctv/prod/PUBLIC_BASE_URL
     → https://api.yourdomain.com
     → (if no domain yet: you'll update this after ALB is created with the ALB DNS)

3. After creating all 19, verify:
   Systems Manager → Parameter Store → filter by "/cctv/prod"
   You should see 19 parameters listed.


================================================================================
STEP 7 — Create IAM Roles for ECS
================================================================================

ECS needs two IAM roles: one to start tasks (execution role) and
one that the running app itself uses (task role).

--- 7a. ECS Task Execution Role ---

1. Go to: https://console.aws.amazon.com/iam/home#/roles
2. Click "Create role"
3. Trusted entity: "AWS service" → Use case: "Elastic Container Service Task"
4. Click "Next"
5. Attach these policies (search and check):
   ✓ AmazonECSTaskExecutionRolePolicy
6. Click "Next"
7. Role name: ecsTaskExecutionRole
8. Click "Create role"

Now add SSM access to this role:
9. Click into "ecsTaskExecutionRole" → "Permissions" tab
10. Click "Add permissions" → "Create inline policy"
11. Click "JSON" tab and paste:
    {
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Action": [
          "ssm:GetParameters",
          "ssm:GetParameter",
          "ssm:GetParametersByPath"
        ],
        "Resource": "arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/*"
      }]
    }
12. Click "Next" → Policy name: CCTVSSMReadAccess → "Create policy"


--- 7b. ECS Task Role ---

1. Go to: https://console.aws.amazon.com/iam/home#/roles
2. Click "Create role"
3. Trusted entity: "AWS service" → Use case: "Elastic Container Service Task"
4. Click "Next" (no managed policies needed for now)
5. Role name: cctvEcsTaskRole
6. Click "Create role"


================================================================================
STEP 8 — Create Security Groups
================================================================================

Security groups control what traffic is allowed in and out.

Go to: https://ap-southeast-2.console.aws.amazon.com/ec2/home#SecurityGroups

--- 8a. ALB Security Group (internet-facing) ---

1. Click "Create security group"
2. Fill in:
   Name:        cctv-alb-sg
   Description: CCTV ALB - public HTTP and HTTPS
   VPC:         (select the default VPC)

3. Inbound rules → "Add rule":
   Rule 1:  Type=HTTP,   Protocol=TCP, Port=80,  Source=Anywhere-IPv4 (0.0.0.0/0)
   Rule 2:  Type=HTTPS,  Protocol=TCP, Port=443, Source=Anywhere-IPv4 (0.0.0.0/0)

4. Click "Create security group"
5. Note the Security Group ID (e.g. sg-0abc123...) — you'll need it next


--- 8b. ECS Task Security Group (private, only from ALB) ---

1. Click "Create security group"
2. Fill in:
   Name:        cctv-ecs-sg
   Description: CCTV ECS Tasks - traffic from ALB only
   VPC:         (same default VPC)

3. Inbound rules → "Add rule":
   Type:   Custom TCP
   Port:   8080
   Source: Custom → type/select "cctv-alb-sg"  (the SG you just created)

4. Click "Create security group"
5. Note this Security Group ID too


================================================================================
STEP 9 — Create the Application Load Balancer & Target Group
================================================================================

The ALB receives all internet traffic and routes it to your ECS tasks.

Go to: https://ap-southeast-2.console.aws.amazon.com/ec2/home#LoadBalancers

--- 9a. Create the ALB ---

1. Click "Create load balancer"
2. Choose: "Application Load Balancer" → Click "Create"
3. Fill in:
   Name:          cctv-monitoring-alb
   Scheme:        Internet-facing
   IP type:       IPv4
   VPC:           default VPC
   Availability zones: ✓ check at least 2 different AZ subnets
   Security groups: select "cctv-alb-sg" (remove the default one)

4. Under "Listeners and routing":
   Leave HTTP:80 for now — we'll add HTTPS after the certificate is ready

5. Click "Create load balancer"
6. Note the ALB DNS name (e.g. cctv-monitoring-alb-123456789.ap-southeast-2.elb.amazonaws.com)
   → Update /cctv/prod/PUBLIC_BASE_URL in SSM to: http://<ALB_DNS>
      (temporarily until you have a custom domain with HTTPS)


--- 9b. Create the Target Group ---

Go to: https://ap-southeast-2.console.aws.amazon.com/ec2/home#TargetGroups

1. Click "Create target group"
2. Fill in:
   Target type:    IP addresses  ← important for Fargate
   Group name:     cctv-api-tg
   Protocol:       HTTP
   Port:           8080
   VPC:            default VPC

3. Health checks:
   Protocol:           HTTP
   Path:               /health/live
   Healthy threshold:  2
   Unhealthy threshold:3
   Timeout:            10 seconds
   Interval:           30 seconds
   Success codes:      200

4. Click "Next" → Click "Create target group"
5. Note the Target Group ARN

--- 9c. Connect the target group to the ALB ---

1. Go back to Load Balancers → click "cctv-monitoring-alb"
2. Click "Listeners" tab → click the HTTP:80 listener → "Edit listener"
3. Default action: "Forward to target group" → select "cctv-api-tg"
4. Click "Save changes"


================================================================================
STEP 10 — Request an HTTPS Certificate (ACM)
================================================================================

Skip this step if you don't have a custom domain yet.
You can use the ALB DNS directly over HTTP for initial testing.

1. Go to: https://ap-southeast-2.console.aws.amazon.com/acm/home
   IMPORTANT: Make sure you're in ap-southeast-2 (Mumbai) region

2. Click "Request a certificate"
3. Choose: "Request a public certificate" → Click "Next"
4. Fill in:
   Domain name:    api.yourdomain.com
   (Optional)      *.yourdomain.com  (wildcard, covers all subdomains)
5. Validation method: DNS validation (recommended)
6. Click "Request"

7. Click into the new certificate → under "Domains" you'll see:
   A CNAME name and CNAME value to add to your DNS provider

8. Add that CNAME record in your domain registrar (GoDaddy, Namecheap, etc.)
   or in Route 53 (see Step 15)

9. Wait for Status to change to "Issued" — usually 5-30 minutes
   Refresh the page periodically to check

10. Note the Certificate ARN once issued


================================================================================
STEP 11 — Attach HTTPS Listener to the ALB
================================================================================

Do this after the ACM certificate status is "Issued".

1. Go to: Load Balancers → cctv-monitoring-alb → "Listeners" tab
2. Click "Add listener"
3. Fill in:
   Protocol:       HTTPS
   Port:           443
   Default action: Forward → select "cctv-api-tg"
   Security policy: ELBSecurityPolicy-TLS13-1-2-2021-06  (most secure)
   Certificate:    (select your ACM certificate from the dropdown)
4. Click "Add"

Now redirect HTTP to HTTPS:
5. Click on the HTTP:80 listener → "Edit listener"
6. Default action: Change to "Redirect to HTTPS" → port 443, status 301
7. Click "Save changes"


================================================================================
STEP 12 — Create the ECS Cluster
================================================================================

1. Go to: https://ap-southeast-2.console.aws.amazon.com/ecs/v2/clusters

2. Click "Create cluster"

3. Fill in:
   Cluster name:  cctv-monitoring-cluster

4. Infrastructure:
   ✓ AWS Fargate (serverless)  ← check this

5. Monitoring:
   ✓ Use Container Insights  ← enables detailed metrics

6. Click "Create"

Wait for the cluster to be created (takes ~30 seconds).


================================================================================
STEP 13 — Create the ECS Task Definition
================================================================================

The task definition describes your containers (API + MediaMTX).

1. Go to: ECS → "Task definitions" (left sidebar) → "Create new task definition"

2. Fill in:
   Task definition family:  cctv-monitoring-backend
   Launch type:             AWS Fargate
   OS/Architecture:         Linux/X86_64
   CPU:                     1 vCPU
   Memory:                  2 GB
   Task role:               cctvEcsTaskRole
   Task execution role:     ecsTaskExecutionRole

3. Under "Container - 1":

   Name:          cctv-api
   Image URI:     437608339995.dkr.ecr.ap-southeast-2.amazonaws.com/cctv-monitoring-backend:latest
   Essential:     ✓ Yes
   Port mappings: Container port = 8080, Protocol = TCP, Name = http

   Environment variables (click "Add environment variable" for each):

   Key: NODE_ENV              Value: production      Type: Value
   Key: PORT                  Value: 8080            Type: Value
   Key: ENABLE_DEMO_FEEDS     Value: false           Type: Value
   Key: ACCESS_TOKEN_EXPIRY   Value: 15m             Type: Value
   Key: REFRESH_TOKEN_EXPIRY  Value: 30d             Type: Value
   Key: OTP_EXPIRY_MINUTES    Value: 10              Type: Value
   Key: SMTP_PORT             Value: 587             Type: Value
   Key: SMTP_SECURE           Value: false           Type: Value
   Key: RATE_LIMIT_WINDOW_MS  Value: 900000          Type: Value
   Key: RATE_LIMIT_MAX        Value: 100             Type: Value
   Key: AUTH_RATE_LIMIT_MAX   Value: 10              Type: Value
   Key: MEDIAMTX_URL          Value: http://localhost:8889  Type: Value
   Key: MEDIAMTX_INTERNAL_HLS_URL    Value: http://localhost:8888  Type: Value
   Key: MEDIAMTX_INTERNAL_WEBRTC_URL Value: http://localhost:8889  Type: Value
   Key: MEDIAMTX_API_URL      Value: http://localhost:9997/v3  Type: Value
   Key: STREAM_TOKEN_EXPIRY   Value: 24h             Type: Value

   Secrets from SSM (click "Add environment variable", Type = "ValueFrom"):

   Key: MONGODB_URI          ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/MONGODB_URI
   Key: ACCESS_TOKEN_SECRET  ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/ACCESS_TOKEN_SECRET
   Key: REFRESH_TOKEN_SECRET ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/REFRESH_TOKEN_SECRET
   Key: SYSTEM_API_KEY       ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/SYSTEM_API_KEY
   Key: SMTP_HOST            ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/SMTP_HOST
   Key: SMTP_USER            ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/SMTP_USER
   Key: SMTP_PASS            ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/SMTP_PASS
   Key: CLOUDINARY_CLOUD_NAME ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/CLOUDINARY_CLOUD_NAME
   Key: CLOUDINARY_API_KEY   ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/CLOUDINARY_API_KEY
   Key: CLOUDINARY_API_SECRET ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/CLOUDINARY_API_SECRET
   Key: FIREBASE_PROJECT_ID  ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/FIREBASE_PROJECT_ID
   Key: FIREBASE_CLIENT_EMAIL ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/FIREBASE_CLIENT_EMAIL
   Key: FIREBASE_PRIVATE_KEY  ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/FIREBASE_PRIVATE_KEY
   Key: RAZORPAY_KEY_ID      ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/RAZORPAY_KEY_ID
   Key: RAZORPAY_KEY_SECRET  ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/RAZORPAY_KEY_SECRET
   Key: MEDIAMTX_STREAM_SECRET ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/MEDIAMTX_STREAM_SECRET
   Key: CORS_ORIGIN          ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/CORS_ORIGIN
   Key: PUBLIC_BASE_URL      ValueFrom: arn:aws:ssm:ap-southeast-2:437608339995:parameter/cctv/prod/PUBLIC_BASE_URL

   Health check:
   Command:          CMD-SHELL, curl -f http://localhost:8080/health/live || exit 1
   Interval:         30
   Timeout:          10
   Start period:     60
   Retries:          3

   Logging (expand "Logging"):
   Log driver:       awslogs
   Log group:        /ecs/cctv-monitoring-backend     ← type this in
   Region:           ap-southeast-2
   Stream prefix:    api
   ✓ Auto-create log group

4. Add MediaMTX as a second container:
   Click "Add container"

   Name:          mediamtx
   Image URI:     bluenviron/mediamtx:1.9.3
   Essential:     ✗ No  (app still runs if MediaMTX crashes)
   Port mappings:
     8554 / TCP   (RTSP)
     8888 / TCP   (HLS)
     8889 / TCP   (WebRTC)
     9997 / TCP   (MediaMTX API)

   Environment variables:
   Key: MTX_API            Value: yes
   Key: MTX_APIADDRESS     Value: 127.0.0.1:9997
   Key: MTX_HLSADDRESS     Value: 127.0.0.1:8888
   Key: MTX_WEBRTCADDRESS  Value: 127.0.0.1:8889
   Key: MTX_RTSPADDRESS    Value: :8554
   Key: MTX_LOGLEVEL       Value: info

   Logging:
   Log group:     /ecs/cctv-monitoring-backend
   Stream prefix: mediamtx

5. Click "Create" to save the task definition


================================================================================
STEP 14 — Create the ECS Service
================================================================================

1. Go to: ECS → Clusters → cctv-monitoring-cluster → "Services" tab
2. Click "Create"

3. Environment:
   Compute options:  Launch type
   Launch type:      FARGATE
   Platform version: LATEST

4. Deployment configuration:
   Application type:   Service
   Task definition:    cctv-monitoring-backend  (select from dropdown)
   Revision:           LATEST
   Service name:       cctv-monitoring-service
   Desired tasks:      1

5. Deployment options:
   ✓ Deployment circuit breaker: ON
   ✓ Rollback on failure: ON

6. Networking:
   VPC:              (select the default VPC)
   Subnets:          ✓ select at least 2 subnets in different AZs
   Security group:   remove default → add "cctv-ecs-sg"
   Public IP:        TURNED ON  ← required since we don't have NAT Gateway

7. Load balancing:
   ✓ Use an existing load balancer
   Load balancer:    cctv-monitoring-alb
   Listener:         80:HTTP  (or 443:HTTPS if certificate is ready)
   Target group:     cctv-api-tg

8. Click "Create"

Watch the "Tasks" tab — after 1-2 minutes you should see:
  Status: RUNNING  |  Last status: RUNNING

If it stays PROVISIONING for more than 5 minutes:
  - Click the Task ID → "Logs" tab to see error messages
  - Most likely cause: wrong image URI, missing SSM parameter, or wrong IAM role


================================================================================
STEP 15 — Point Your Domain to the ALB
================================================================================

Skip if you don't have a custom domain. Use the ALB DNS directly for testing.

--- If using Route 53 ---

1. Go to: https://console.aws.amazon.com/route53/v2/hostedzones
2. Click your hosted zone (e.g. yourdomain.com)
3. Click "Create record"
   Record name:  api
   Record type:  A
   ✓ Alias: ON
   Route traffic to:
     → Alias to Application and Classic Load Balancer
     → Region: ap-southeast-2
     → Select the cctv-monitoring-alb from the dropdown
4. Click "Create records"

--- If using another registrar (Namecheap, GoDaddy, etc.) ---

1. Get the ALB DNS name from: Load Balancers → cctv-monitoring-alb → Description tab
2. In your registrar's DNS settings, add:
   Type: CNAME
   Host: api
   Value: <paste the ALB DNS name>
   TTL:  300


================================================================================
STEP 16 — Create CloudWatch Alarms
================================================================================

1. Go to: https://ap-southeast-2.console.aws.amazon.com/cloudwatch/home#alarmsV2:

--- Alarm 1: Unhealthy hosts ---

2. Click "Create alarm" → "Select metric"
3. Browse: ApplicationELB → Per AppELB, per TG Metrics
4. Find "UnHealthyHostCount" for your target group → "Select metric"
5. Period: 1 minute
6. Threshold: Greater than 0
7. Datapoints: 2 out of 2
8. Alarm name: CCTV-UnhealthyHosts
9. Click "Next" → (optionally set up SNS email alert) → "Create alarm"

--- Alarm 2: High 5XX error rate ---

10. Click "Create alarm" → "Select metric"
11. Browse: ApplicationELB → Per AppELB Metrics → HTTPCode_Target_5XX_Count
12. Period: 5 minutes, Statistic: Sum
13. Threshold: Greater than 10
14. Alarm name: CCTV-High5xxErrors
15. Click "Create alarm"


================================================================================
STEP 17 — Verify the Deployment
================================================================================

Find your public URL:
- With custom domain: https://api.yourdomain.com
- Without domain: http://<ALB DNS name>   (get from Load Balancers page)

Test in your browser:
  http://<YOUR_URL>/health/live
  → Should return: {"status":"ok"} or similar

  http://<YOUR_URL>/health/ready
  → Should return: {"status":"ok","mongodb":"connected"}

Test HTTPS redirect (if certificate is set up):
  Open http://api.yourdomain.com in browser → should auto-redirect to https://

Check the logs:
1. Go to: CloudWatch → Log groups → /ecs/cctv-monitoring-backend
2. Click the "api/..." log stream
3. You should see the server startup banner with "Server running on port 8080"

If the health check fails:
1. ECS → Clusters → cctv-monitoring-cluster → Tasks tab
2. Click the running task → "Logs" tab → look for the error message


================================================================================
STEP 18 — Set Up Auto-Scaling
================================================================================

Automatically add more tasks when CPU is high.

1. Go to: ECS → Clusters → cctv-monitoring-cluster → Services tab
2. Click "cctv-monitoring-service" → "Update service"
3. Scroll to "Service auto scaling"
4. ✓ "Use service auto scaling"
5. Fill in:
   Minimum number of tasks: 1
   Maximum number of tasks: 4

6. Click "Add scaling policy"
   Policy name:       cctv-cpu-scaling
   Policy type:       Target tracking
   Metric type:       ECSServiceAverageCPUUtilization
   Target value:      70
   Scale-out cooldown: 60 seconds
   Scale-in cooldown:  300 seconds

7. Click "Update"


================================================================================
STEP 19 — CI/CD with GitHub Actions (optional but recommended)
================================================================================

Automate deployment on every push to main.

1. Create the file .github/workflows/deploy.yml in your project:

-----  BEGIN FILE CONTENT  -----

name: Deploy to AWS ECS

on:
  push:
    branches: [main]

env:
  AWS_REGION: ap-southeast-2
  ECR_REPOSITORY: cctv-monitoring-backend
  ECS_CLUSTER: cctv-monitoring-cluster
  ECS_SERVICE: cctv-monitoring-service
  CONTAINER_NAME: cctv-api

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build, tag, push image to ECR
        id: build-image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build --platform linux/amd64 \
            --build-arg PORT=8080 \
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

      - name: Update image in task definition
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

-----  END FILE CONTENT  -----

2. In GitHub → your repo → Settings → Secrets and variables → Actions:
   Click "New repository secret" for each:
   Name: AWS_ACCESS_KEY_ID     → your current Access Key ID
   Name: AWS_SECRET_ACCESS_KEY → your current Secret Access Key

3. Push a commit to main → go to Actions tab to watch the deployment


================================================================================
STEP 20 — Cost Overview (ap-southeast-2, 1 task running 24/7)
================================================================================

  Service                          Monthly Cost
  -----------------------------------------------
  ECS Fargate (1 vCPU / 2 GB)     ~$28
  Application Load Balancer        ~$18
  ECR (image storage ~500 MB)      ~$0.50
  SSM Parameter Store (19 params)  ~$0.38
  CloudWatch Logs (5 GB/month)     ~$2.50
  Data transfer out (10 GB)        ~$0.85
  Public IPv4 address (Fargate)    ~$3.65
  ACM Certificate                  FREE
  MongoDB Atlas M0                 FREE
  -----------------------------------------------
  TOTAL (no NAT Gateway)           ~$54/month

  TIP: Set "Public IP: TURNED ON" for Fargate tasks (done in Step 14)
  to avoid the $33/month NAT Gateway charge. This works fine for this
  project since traffic goes through the ALB anyway.


================================================================================
QUICK REFERENCE — After Deployment
================================================================================

To update the app after code changes:
  1. Run: ./aws/ecr-push.sh ap-southeast-2 latest
  2. Go to: ECS → Clusters → cctv-monitoring-cluster → Services
  3. Click "cctv-monitoring-service" → "Update service"
  4. ✓ Check "Force new deployment"
  5. Click "Update"
  6. Watch the Tasks tab until the new task is RUNNING

To view live logs:
  CloudWatch → Log groups → /ecs/cctv-monitoring-backend → most recent stream

To rollback to a previous version:
  ECS → cctv-monitoring-service → "Update service"
  Task definition revision: select a previous number from the dropdown
  ✓ Force new deployment → Update

================================================================================
