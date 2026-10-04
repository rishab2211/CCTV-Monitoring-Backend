================================================================================
  CCTV Monitoring Platform — VPS Deployment Guide
  (SSH + Password Login VPS → Production on the Internet)
================================================================================

Every command in this guide is copy-paste ready.
File writes use heredocs (cat > file << 'EOF') so you never have to
open a text editor. Read each block, replace the placeholders
(marked with <ANGLE_BRACKETS>), then paste.

Prerequisites:
  - VPS running Ubuntu 22.04 LTS
  - Public IP address
  - Root SSH access with password (provided by your VPS host)

Final result:
  https://api.yourdomain.com    ← CCTV Backend API
  https://admin.yourdomain.com  ← Admin Panel

================================================================================
TABLE OF CONTENTS
================================================================================

  PHASE 1 — Secure the VPS
    Step 1.  First login & system update
    Step 2.  Create a non-root sudo user
    Step 3.  Generate & upload SSH key (disable password login)
    Step 4.  Configure UFW firewall
    Step 5.  Install fail2ban

  PHASE 2 — Install Runtime Dependencies
    Step 6.  Install Docker
    Step 7.  Install Nginx
    Step 8.  Install Certbot

  PHASE 3 — Deploy the Backend
    Step 9.  Clone the repository
    Step 10. Generate secrets & create the .env file
    Step 11. Build & test the Docker container
    Step 12. Create systemd service

  PHASE 4 — Configure Nginx & HTTPS
    Step 13. Write Nginx config for the API
    Step 14. Deploy the Admin Panel
    Step 15. Configure DNS records
    Step 16. Issue SSL certificates

  PHASE 5 — Verify & Harden
    Step 17. Full smoke test
    Step 18. Configure log rotation
    Step 19. Set up health-check cron

  PHASE 6 — Updates & CI/CD
    Step 20. Create the deploy script (manual updates)
    Step 21. GitHub Actions auto-deploy (optional)

  APPENDIX
    A. Environment variable reference
    B. Troubleshooting commands
    C. Useful one-liners


================================================================================
PHASE 1 — SECURE THE VPS
================================================================================

────────────────────────────────────────────────────────────────────────────────
STEP 1 — First Login & System Update
[Run on VPS as: root]
────────────────────────────────────────────────────────────────────────────────

  # From your LOCAL machine — SSH in with root password:
  ssh root@<YOUR_VPS_IP>

  # Update all packages:
  apt update && apt upgrade -y

  # Install essential tools:
  apt install -y curl wget git unzip htop nano ufw

  # Set timezone to UTC:
  timedatectl set-timezone UTC

  # Verify:
  date
  # Should show: Sat Oct  3 14:xx:xx UTC 2026


────────────────────────────────────────────────────────────────────────────────
STEP 2 — Create a Non-Root Sudo User
[Run on VPS as: root]
────────────────────────────────────────────────────────────────────────────────

  # Create the deploy user (you'll be prompted to set a password):
  adduser deploy

  # Grant sudo rights:
  usermod -aG sudo deploy

  # Verify:
  id deploy
  # Expected: uid=1001(deploy) gid=1001(deploy) groups=1001(deploy),27(sudo)


────────────────────────────────────────────────────────────────────────────────
STEP 3 — Generate & Upload SSH Key (Disable Password Login)
[Run on LOCAL machine first, then VPS]
────────────────────────────────────────────────────────────────────────────────

  ── On your LOCAL machine ────────────────────────────────────────────────────

  # Check if you already have an SSH key:
  ls ~/.ssh/id_ed25519.pub

  # If that file does NOT exist, generate a new key:
  ssh-keygen -t ed25519 -C "your_email@example.com"
  # Press Enter three times (accept defaults, no passphrase)

  # Copy your public key to the VPS:
  ssh-copy-id -i ~/.ssh/id_ed25519.pub deploy@<YOUR_VPS_IP>
  # Enter the deploy user's password when prompted

  # Test key-based login before we disable passwords:
  ssh deploy@<YOUR_VPS_IP>
  # Should log in WITHOUT asking for a password. If it works, continue.
  # Stay logged in as deploy for the next commands.

  ── On the VPS as deploy ─────────────────────────────────────────────────────

  # Harden SSH config:
  sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
  sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  sudo sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config

  # Verify the changes look correct:
  grep -E 'PermitRootLogin|PasswordAuthentication|PubkeyAuthentication' /etc/ssh/sshd_config

  # Restart SSH (your existing session stays alive):
  sudo systemctl restart sshd

  # Open a NEW terminal on your local machine and test:
  # ssh deploy@<YOUR_VPS_IP>
  # Must work without a password. If it does, root+password login is now blocked.


────────────────────────────────────────────────────────────────────────────────
STEP 4 — Configure UFW Firewall
[Run on VPS as: deploy]
────────────────────────────────────────────────────────────────────────────────

  # Deny all incoming, allow all outgoing:
  sudo ufw default deny incoming
  sudo ufw default allow outgoing

  # Allow SSH — do this FIRST or you'll lock yourself out:
  sudo ufw allow ssh

  # Allow HTTP (needed for Let's Encrypt challenge + redirect):
  sudo ufw allow 80/tcp

  # Allow HTTPS:
  sudo ufw allow 443/tcp

  # Allow RTSP (cameras push streams to MediaMTX on this port):
  sudo ufw allow 8554/tcp

  # Enable the firewall (type 'y' when prompted):
  sudo ufw enable

  # Verify the rules:
  sudo ufw status verbose

  # Expected output:
  #   Status: active
  #   To          Action   From
  #   --          ------   ----
  #   22/tcp      ALLOW    Anywhere
  #   80/tcp      ALLOW    Anywhere
  #   443/tcp     ALLOW    Anywhere
  #   8554/tcp    ALLOW    Anywhere
  #
  # NOTE: Port 8080 (the app) is NOT listed — it's internal only (Nginx proxies to it).


────────────────────────────────────────────────────────────────────────────────
STEP 5 — Install fail2ban
[Run on VPS as: deploy]
────────────────────────────────────────────────────────────────────────────────

  # Install:
  sudo apt install -y fail2ban

  # Copy default config as local override:
  sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

  # Write the SSH jail config (backend = systemd is required on Ubuntu 24.04+):
  sudo tee /etc/fail2ban/jail.d/sshd-custom.conf > /dev/null << 'EOF'
  [sshd]
  enabled  = true
  port     = ssh
  backend  = systemd
  maxretry = 5
  bantime  = 3600
  findtime = 600
  EOF

  # Enable and start:
  sudo systemctl enable fail2ban
  sudo systemctl start fail2ban

  # Verify:
  sudo fail2ban-client status sshd
  # Should show "Number of currently banned IPs: 0" (or more if attacks already)


================================================================================
PHASE 2 — INSTALL RUNTIME DEPENDENCIES
================================================================================

────────────────────────────────────────────────────────────────────────────────
STEP 6 — Install Docker
[Run on VPS as: deploy]
────────────────────────────────────────────────────────────────────────────────

  # Install Docker from the official script:
  curl -fsSL https://get.docker.com | sudo sh

  # Add deploy user to docker group so it can run docker without sudo:
  sudo usermod -aG docker deploy

  # Apply the new group membership for this shell session
  # (avoids needing to log out and back in):
  newgrp docker

  # Enable Docker to start automatically on reboot:
  sudo systemctl enable docker
  sudo systemctl start docker

  # Verify Docker is working:
  docker --version
  # Expected: Docker version 27.x.x, build ...

  docker compose version
  # Expected: Docker Compose version v2.x.x

  # Sanity test:
  docker run --rm hello-world
  # Should print "Hello from Docker!" then exit cleanly


────────────────────────────────────────────────────────────────────────────────
STEP 7 — Install Nginx
[Run on VPS as: deploy]
────────────────────────────────────────────────────────────────────────────────

  sudo apt install -y nginx

  sudo systemctl enable nginx
  sudo systemctl start nginx

  # Verify:
  sudo systemctl status nginx
  # Look for: Active: active (running)

  # Quick browser test: open http://<YOUR_VPS_IP>
  # You should see the Nginx welcome page.


────────────────────────────────────────────────────────────────────────────────
STEP 8 — Install Certbot
[Run on VPS as: deploy]
────────────────────────────────────────────────────────────────────────────────

  sudo apt install -y certbot python3-certbot-nginx

  # Verify:
  certbot --version


================================================================================
PHASE 3 — DEPLOY THE BACKEND
================================================================================

────────────────────────────────────────────────────────────────────────────────
STEP 9 — Clone the Repository
[Run on VPS as: deploy]
────────────────────────────────────────────────────────────────────────────────

  # Create the app directory:
  sudo mkdir -p /opt/cctv
  sudo chown deploy:deploy /opt/cctv

  # ── Public repo ──────────────────────────────────────────────────────────
  git clone https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>.git /opt/cctv/backend

  # ── Private repo — Option A: Personal Access Token ────────────────────
  # git clone https://<YOUR_GITHUB_USERNAME>:<YOUR_PAT>@github.com/<YOUR_GITHUB_USERNAME>/<REPO>.git /opt/cctv/backend

  # ── Private repo — Option B: Deploy Key (more secure) ─────────────────
  # ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
  # cat ~/.ssh/github_deploy.pub
  # → Copy that output → GitHub repo → Settings → Deploy keys → Add deploy key
  # → Then run:
  # mkdir -p ~/.ssh && tee -a ~/.ssh/config << 'EOF'
  # Host github.com
  #   IdentityFile ~/.ssh/github_deploy
  # EOF
  # git clone git@github.com:<YOUR_GITHUB_USERNAME>/<REPO>.git /opt/cctv/backend
  # ──────────────────────────────────────────────────────────────────────────

  cd /opt/cctv/backend

  # Verify the project is there:
  ls -la
  # You should see: Dockerfile, package.json, src/, entrypoint.sh, env.example, etc.


────────────────────────────────────────────────────────────────────────────────
STEP 10 — Generate Secrets & Create the .env File
[Run on VPS as: deploy]
────────────────────────────────────────────────────────────────────────────────

  cd /opt/cctv/backend

  # Generate all secrets now so you can paste them into the .env below:
  echo "=== Generating secrets ==="
  echo "ACCESS_TOKEN_SECRET:    $(openssl rand -hex 48)"
  echo "REFRESH_TOKEN_SECRET:   $(openssl rand -hex 48)"
  echo "SYSTEM_API_KEY:         $(openssl rand -hex 32)"
  echo "MEDIAMTX_STREAM_SECRET: $(openssl rand -hex 32)"

  # Copy the output somewhere safe before continuing.

  # Now write the production .env file.
  # Replace every <PLACEHOLDER> with your real value:
  cat > /opt/cctv/backend/.env << 'EOF'
  # ── Server ─────────────────────────────────────────────────────────────────
  NODE_ENV=production
  PORT=8080

  # ── Public URL (update this after Step 16 DNS is confirmed) ────────────────
  PUBLIC_BASE_URL=https://api.yourdomain.com

  # ── MongoDB Atlas ──────────────────────────────────────────────────────────
  MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/cctv_monitoring?retryWrites=true&w=majority

  # ── JWT ────────────────────────────────────────────────────────────────────
  ACCESS_TOKEN_SECRET=<PASTE_96_CHAR_HEX_FROM_ABOVE>
  REFRESH_TOKEN_SECRET=<PASTE_96_CHAR_HEX_FROM_ABOVE>
  ACCESS_TOKEN_EXPIRY=15m
  REFRESH_TOKEN_EXPIRY=30d

  # ── OTP ────────────────────────────────────────────────────────────────────
  OTP_EXPIRY_MINUTES=10

  # ── SMTP (Gmail App Password recommended) ─────────────────────────────────
  # Get App Password: myaccount.google.com/apppasswords
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_SECURE=false
  SMTP_USER=youremail@gmail.com
  SMTP_PASS=xxxx xxxx xxxx xxxx
  EMAIL_FROM=CCTV Monitor <noreply@yourdomain.com>

  # ── Cloudinary ─────────────────────────────────────────────────────────────
  CLOUDINARY_CLOUD_NAME=your_cloud_name
  CLOUDINARY_API_KEY=your_api_key
  CLOUDINARY_API_SECRET=your_api_secret

  # ── Firebase ───────────────────────────────────────────────────────────────
  FIREBASE_PROJECT_ID=your_project_id
  FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"

  # ── Razorpay ───────────────────────────────────────────────────────────────
  RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
  RAZORPAY_KEY_SECRET=your_razorpay_secret

  # ── MediaMTX (loopback — runs inside same container) ──────────────────────
  MEDIAMTX_URL=http://127.0.0.1:8889
  MEDIAMTX_INTERNAL_HLS_URL=http://127.0.0.1:8888
  MEDIAMTX_INTERNAL_WEBRTC_URL=http://127.0.0.1:8889
  MEDIAMTX_API_URL=http://127.0.0.1:9997/v3
  MEDIAMTX_STREAM_SECRET=<PASTE_64_CHAR_HEX_FROM_ABOVE>
  STREAM_TOKEN_EXPIRY=24h

  # ── Demo Feeds ─────────────────────────────────────────────────────────────
  ENABLE_DEMO_FEEDS=false

  # ── Rate Limiting ──────────────────────────────────────────────────────────
  RATE_LIMIT_WINDOW_MS=900000
  RATE_LIMIT_MAX=100
  AUTH_RATE_LIMIT_MAX=10

  # ── CORS (must be HTTPS in production) ────────────────────────────────────
  CORS_ORIGIN=https://admin.yourdomain.com,https://yourdomain.com

  # ── Internal System API Key ────────────────────────────────────────────────
  SYSTEM_API_KEY=<PASTE_64_CHAR_HEX_FROM_ABOVE>
  EOF

  # NOTE: The heredoc above uses 'EOF' (quoted) so shell variables inside
  # are treated as literal text — exactly what we want for a .env file.

  # Lock down permissions:
  chmod 600 /opt/cctv/backend/.env

  # Verify the file looks right:
  cat /opt/cctv/backend/.env

  # Verify permissions (should show -rw-------):
  ls -la /opt/cctv/backend/.env


────────────────────────────────────────────────────────────────────────────────
STEP 11 — Build & Test the Docker Container
[Run on VPS as: deploy]
────────────────────────────────────────────────────────────────────────────────

  cd /opt/cctv/backend

  # Build the image (first run downloads ~500 MB — takes 3–8 minutes):
  docker build -t cctv-backend:latest .

  # Confirm the image exists:
  docker images | grep cctv-backend

  # ── Test Run (smoke test — press Ctrl+C to stop after testing) ────────────

  docker run --rm \
    --env-file /opt/cctv/backend/.env \
    -p 8080:8080 \
    --name cctv-test \
    cctv-backend:latest &

  # Wait ~15 seconds for the server to start, then test:
  sleep 15
  curl -s http://localhost:8080/health/live
  # Expected output: {"status":"ok"}

  curl -s http://localhost:8080/health/ready
  # Expected output: {"status":"ok","mongodb":"connected"}
  # If mongodb shows "disconnected", check your MONGODB_URI in .env

  # Stop the test container:
  docker stop cctv-test

  # ── If the test passed, start the production container ────────────────────

  docker run -d \
    --name cctv-backend \
    --env-file /opt/cctv/backend/.env \
    -p 127.0.0.1:8080:8080 \
    --restart unless-stopped \
    --log-driver json-file \
    --log-opt max-size=50m \
    --log-opt max-file=5 \
    cctv-backend:latest

  # Verify it's running:
  docker ps
  # Should show: cctv-backend  Up X seconds

  # Follow startup logs:
  docker logs -f cctv-backend
  # Wait for "Server running on port 8080" or similar
  # Press Ctrl+C when you see it

  # IMPORTANT: -p 127.0.0.1:8080:8080 binds the port to loopback ONLY.
  # Port 8080 is NOT reachable from the internet — Nginx proxies to it internally.


────────────────────────────────────────────────────────────────────────────────
STEP 12 — Create systemd Service (Auto-Start on Reboot)
[Run on VPS as: deploy]
────────────────────────────────────────────────────────────────────────────────

  # Write the systemd unit file:
  sudo tee /etc/systemd/system/cctv-backend.service > /dev/null << 'EOF'
  [Unit]
  Description=CCTV Monitoring Backend (Docker)
  Requires=docker.service
  After=docker.service network-online.target
  Wants=network-online.target

  [Service]
  Type=simple
  User=deploy
  Restart=always
  RestartSec=10
  ExecStartPre=-/usr/bin/docker stop cctv-backend
  ExecStartPre=-/usr/bin/docker rm cctv-backend
  ExecStart=/usr/bin/docker run \
    --name cctv-backend \
    --env-file /opt/cctv/backend/.env \
    -p 127.0.0.1:8080:8080 \
    --log-driver json-file \
    --log-opt max-size=50m \
    --log-opt max-file=5 \
    cctv-backend:latest
  ExecStop=/usr/bin/docker stop cctv-backend

  [Install]
  WantedBy=multi-user.target
  EOF

  # Stop the manually-started container (systemd will manage it from now on):
  docker stop cctv-backend
  docker rm cctv-backend

  # Reload systemd so it sees the new unit file:
  sudo systemctl daemon-reload

  # Enable the service (auto-start on boot):
  sudo systemctl enable cctv-backend

  # Start it now:
  sudo systemctl start cctv-backend

  # Check it started successfully:
  sudo systemctl status cctv-backend
  # Look for: Active: active (running)

  # Follow live logs:
  sudo journalctl -u cctv-backend -f
  # Wait for "Server running on port 8080", then Ctrl+C

  # Test that it survives a reboot:
  sudo reboot
  # Wait ~60 seconds, then SSH back in and verify:
  # ssh deploy@<YOUR_VPS_IP>
  # docker ps        ← cctv-backend should be RUNNING automatically


================================================================================
PHASE 4 — CONFIGURE NGINX & HTTPS
================================================================================

────────────────────────────────────────────────────────────────────────────────
STEP 13 — Write Nginx Config for the API
[Run on VPS as: deploy]
────────────────────────────────────────────────────────────────────────────────

  # Remove the default Nginx welcome page:
  sudo rm -f /etc/nginx/sites-enabled/default

  # Write the API virtual host config:
  # Replace api.yourdomain.com with your actual subdomain
  sudo tee /etc/nginx/sites-available/cctv-api > /dev/null << 'EOF'
  # CCTV Monitoring Backend API
  # Certbot will automatically add the HTTPS server block in Step 16.

  server {
      listen 80;
      listen [::]:80;
      server_name api.yourdomain.com;

      # Let's Encrypt HTTP challenge (needed for certificate issuance)
      location /.well-known/acme-challenge/ {
          root /var/www/certbot;
      }

      # Proxy all other requests to the Docker container
      location / {
          proxy_pass         http://127.0.0.1:8080;
          proxy_http_version 1.1;

          # WebSocket / Socket.IO support
          proxy_set_header   Upgrade           $http_upgrade;
          proxy_set_header   Connection        "upgrade";

          # Pass real client IP and protocol to the app
          proxy_set_header   Host              $host;
          proxy_set_header   X-Real-IP         $remote_addr;
          proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
          proxy_set_header   X-Forwarded-Proto $scheme;

          # Timeouts — high for streaming / long-polling
          proxy_connect_timeout  60s;
          proxy_send_timeout     60s;
          proxy_read_timeout    300s;

          # Max upload size (thumbnails, video clips)
          client_max_body_size  50M;
      }
  }
  EOF

  # Enable the site:
  sudo ln -s /etc/nginx/sites-available/cctv-api /etc/nginx/sites-enabled/

  # Test the config:
  sudo nginx -t
  # Expected: nginx: configuration file /etc/nginx/nginx.conf test is successful

  # Reload (zero-downtime):
  sudo systemctl reload nginx

  # Quick local test:
  curl -s http://localhost:8080/health/live
  # Expected: {"status":"ok"}


────────────────────────────────────────────────────────────────────────────────
STEP 14 — Deploy the Admin Panel
[Run on VPS as: deploy]
────────────────────────────────────────────────────────────────────────────────

  # Create the directory Nginx will serve:
  sudo mkdir -p /var/www/cctv-admin
  sudo chown -R deploy:www-data /var/www/cctv-admin
  sudo chmod -R 755 /var/www/cctv-admin

  # ── Option A: Upload build from your LOCAL machine ────────────────────────
  # Run this command on YOUR LOCAL machine (not the VPS):
  #
  #   rsync -avz --delete \
  #     /path/to/admin-panel/dist/ \
  #     deploy@<YOUR_VPS_IP>:/var/www/cctv-admin/
  #
  # Example if your admin panel is at ~/Projects/CCTV-Admin:
  #   rsync -avz --delete \
  #     ~/Projects/CCTV-Admin/dist/ \
  #     deploy@<YOUR_VPS_IP>:/var/www/cctv-admin/
  # ──────────────────────────────────────────────────────────────────────────

  # ── Option B: Build directly on the VPS ──────────────────────────────────
  # Install Node.js (needed to run the admin panel build):
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs

  # Clone and build the admin panel:
  git clone https://github.com/<YOUR_USERNAME>/<ADMIN_REPO>.git /opt/cctv/admin
  cd /opt/cctv/admin
  npm install
  npm run build

  # Copy the build output to the Nginx serving directory:
  cp -r dist/* /var/www/cctv-admin/
  # ──────────────────────────────────────────────────────────────────────────

  # Write the Nginx config for the admin panel:
  # Replace admin.yourdomain.com with your actual subdomain
  sudo tee /etc/nginx/sites-available/cctv-admin > /dev/null << 'EOF'
  # CCTV Monitoring Admin Panel (static web app)

  server {
      listen 80;
      listen [::]:80;
      server_name admin.yourdomain.com;

      root  /var/www/cctv-admin;
      index index.html;

      # SPA fallback — React/Vue Router: unknown paths serve index.html
      location / {
          try_files $uri $uri/ /index.html;
      }

      # Aggressively cache hashed static assets (JS, CSS, images, fonts)
      location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
          expires 1y;
          add_header Cache-Control "public, immutable";
      }

      # Security headers
      add_header X-Frame-Options           "SAMEORIGIN"                   always;
      add_header X-Content-Type-Options    "nosniff"                      always;
      add_header X-XSS-Protection          "1; mode=block"                always;
      add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
  }
  EOF

  # Enable the site:
  sudo ln -s /etc/nginx/sites-available/cctv-admin /etc/nginx/sites-enabled/

  # Test and reload:
  sudo nginx -t
  sudo systemctl reload nginx


────────────────────────────────────────────────────────────────────────────────
STEP 15 — Configure DNS Records
[Do this in your domain registrar's dashboard]
────────────────────────────────────────────────────────────────────────────────

  Log into Namecheap / GoDaddy / Cloudflare (wherever your domain is managed).
  Add these DNS records:

    Type   Host (Name)   Value                TTL
    ─────────────────────────────────────────────────
    A      api           <YOUR_VPS_IP>         300
    A      admin         <YOUR_VPS_IP>         300
    A      @             <YOUR_VPS_IP>         300  (optional — root domain)

  Replace <YOUR_VPS_IP> with your actual server IP address.

  ── If using Cloudflare ─────────────────────────────────────────────────────
  IMPORTANT: When adding the records, set the proxy status to
             "DNS only" (grey cloud icon) for both subdomains.
             This is required for Certbot to verify domain ownership.
             You can re-enable the proxy (orange cloud) after Step 16.
  ────────────────────────────────────────────────────────────────────────────

  # Wait for DNS to propagate (usually 5–30 minutes).
  # Verify from your LOCAL machine:
  nslookup api.yourdomain.com
  # Must return <YOUR_VPS_IP> before you run Step 16.

  # Online propagation checker: https://www.whatsmydns.net/#A/api.yourdomain.com


────────────────────────────────────────────────────────────────────────────────
STEP 16 — Issue SSL Certificates (Let's Encrypt)
[Run on VPS as: deploy — ONLY after DNS is propagated]
────────────────────────────────────────────────────────────────────────────────

  # Replace the emails and domains with your actual values:
  sudo certbot --nginx \
    -d api.yourdomain.com \
    -d admin.yourdomain.com \
    --non-interactive \
    --agree-tos \
    --email your@email.com \
    --redirect

  # What each flag does:
  #   --nginx       : auto-edits your Nginx configs to add HTTPS
  #   --redirect    : adds 301 redirect from HTTP to HTTPS
  #   --agree-tos   : accept Let's Encrypt terms of service
  #   --redirect    : redirects HTTP to HTTPS automatically

  # Verify certificates were issued:
  sudo certbot certificates
  # Should list api.yourdomain.com and admin.yourdomain.com with expiry ~90 days

  # Verify auto-renewal timer is running:
  sudo systemctl status certbot.timer
  # Should show: Active: active (waiting)

  # Dry-run renewal to make sure it will work:
  sudo certbot renew --dry-run
  # Should end with "Congratulations, all simulated renewals succeeded"

  # View the updated Nginx config (Certbot adds HTTPS blocks automatically):
  cat /etc/nginx/sites-available/cctv-api


================================================================================
PHASE 5 — VERIFY & HARDEN
================================================================================

────────────────────────────────────────────────────────────────────────────────
STEP 17 — Full Smoke Test
[Run from your LOCAL machine]
────────────────────────────────────────────────────────────────────────────────

  # 1. Liveness check (is the server up?):
  curl -s https://api.yourdomain.com/health/live
  # Expected: {"status":"ok"}

  # 2. Readiness check (is MongoDB connected?):
  curl -s https://api.yourdomain.com/health/ready
  # Expected: {"status":"ok","mongodb":"connected"}

  # 3. HTTP → HTTPS redirect:
  curl -I http://api.yourdomain.com/health/live
  # Expected: HTTP/1.1 301 Moved Permanently
  #           Location: https://api.yourdomain.com/health/live

  # 4. TLS certificate details:
  curl -vI https://api.yourdomain.com/health/live 2>&1 | grep -E 'subject|expire|SSL'
  # Should show a valid certificate for api.yourdomain.com

  # 5. Admin panel (open in browser):
  # https://admin.yourdomain.com

  # 6. SSL grade (run from browser — aim for A or A+):
  # https://www.ssllabs.com/ssltest/analyze.html?d=api.yourdomain.com

  # ── Back on the VPS ──────────────────────────────────────────────────────

  ssh deploy@<YOUR_VPS_IP>

  # 7. Container status:
  docker ps
  # cctv-backend should show STATUS "Up X minutes (healthy)"

  # 8. Recent Nginx access logs:
  sudo tail -50 /var/log/nginx/access.log

  # 9. Recent Nginx errors:
  sudo tail -20 /var/log/nginx/error.log

  # 10. Backend app logs (last 10 minutes):
  sudo journalctl -u cctv-backend --since "10 minutes ago"

  # 11. Disk usage:
  df -h /
  # Make sure you have >20% free space

  # 12. Memory usage:
  free -h


────────────────────────────────────────────────────────────────────────────────
STEP 18 — Configure Log Rotation
[Run on VPS as: deploy]
────────────────────────────────────────────────────────────────────────────────

  # Nginx log rotation (keep 30 days, compress old files):
  sudo tee /etc/logrotate.d/nginx > /dev/null << 'EOF'
  /var/log/nginx/*.log {
      daily
      missingok
      rotate 30
      compress
      delaycompress
      notifempty
      create 0640 www-data adm
      sharedscripts
      postrotate
          /bin/kill -USR1 $(cat /var/run/nginx.pid 2>/dev/null) 2>/dev/null || true
      endscript
  }
  EOF

  # Test the config (dry run):
  sudo logrotate --debug /etc/logrotate.d/nginx
  # Should say "considering log" and "no need to rotate" (nothing old yet)

  # Docker log limits are already set (--log-opt max-size=50m --log-opt max-file=5)
  # when we started the container in Step 11 / Step 12. Verify:
  docker inspect cctv-backend | grep -A5 '"LogConfig"'


────────────────────────────────────────────────────────────────────────────────
STEP 19 — Health-Check Cron
[Run on VPS as: deploy]
────────────────────────────────────────────────────────────────────────────────

  # Write the health-check script:
  sudo tee /usr/local/bin/cctv-healthcheck.sh > /dev/null << 'EOF'
  #!/bin/bash
  # CCTV Backend Health Monitor
  # Runs every 5 minutes via root crontab.
  # Restarts the service if the health endpoint stops responding.

  HEALTH_URL="http://localhost:8080/health/live"
  SERVICE="cctv-backend"
  LOG="/var/log/cctv-healthcheck.log"

  timestamp() { date +"%Y-%m-%d %H:%M:%S"; }

  response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL")

  if [ "$response" != "200" ]; then
      echo "[$(timestamp)] ALERT: health check returned HTTP $response. Restarting $SERVICE..." >> "$LOG"
      systemctl restart "$SERVICE"
      sleep 15
      response2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL")
      echo "[$(timestamp)] Post-restart check: HTTP $response2" >> "$LOG"
  fi
  EOF

  # Make it executable:
  sudo chmod +x /usr/local/bin/cctv-healthcheck.sh

  # Create the log file with correct permissions:
  sudo touch /var/log/cctv-healthcheck.log
  sudo chmod 644 /var/log/cctv-healthcheck.log

  # Test the script manually (should complete silently = healthy):
  sudo /usr/local/bin/cctv-healthcheck.sh

  # Install the cron job (runs as root so it can call systemctl):
  # This uses a non-interactive approach to avoid opening an editor:
  ( sudo crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/cctv-healthcheck.sh" ) | sudo crontab -

  # Verify the cron was installed:
  sudo crontab -l
  # Should show: */5 * * * * /usr/local/bin/cctv-healthcheck.sh


================================================================================
PHASE 6 — UPDATES & CI/CD
================================================================================

────────────────────────────────────────────────────────────────────────────────
STEP 20 — Create the Deploy Script (Manual Updates)
[Run on VPS as: deploy]
────────────────────────────────────────────────────────────────────────────────

  # Write a one-command deploy script:
  sudo tee /opt/cctv/deploy.sh > /dev/null << 'EOF'
  #!/bin/bash
  set -e

  echo ""
  echo "======================================="
  echo "  CCTV Backend — Deploying new version"
  echo "======================================="

  cd /opt/cctv/backend

  echo "[1/4] Pulling latest code from git..."
  git pull origin main

  echo "[2/4] Building Docker image..."
  docker build -t cctv-backend:latest .

  echo "[3/4] Restarting systemd service..."
  sudo systemctl restart cctv-backend

  echo "[4/4] Waiting 15 seconds then running health check..."
  sleep 15

  response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:8080/health/live)

  if [ "$response" = "200" ]; then
      echo ""
      echo "✅ Deployment successful! API is healthy."
  else
      echo ""
      echo "❌ Health check FAILED (HTTP $response)."
      echo "   Check logs: sudo journalctl -u cctv-backend -n 50"
      exit 1
  fi
  EOF

  # Make it executable:
  sudo chmod +x /opt/cctv/deploy.sh

  # Grant deploy user passwordless sudo for systemctl restart (needed by the script):
  echo "deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart cctv-backend, /bin/systemctl status cctv-backend" | sudo tee /etc/sudoers.d/cctv-deploy > /dev/null
  sudo chmod 440 /etc/sudoers.d/cctv-deploy

  # Verify the sudoers file is valid:
  sudo visudo -c -f /etc/sudoers.d/cctv-deploy
  # Expected: /etc/sudoers.d/cctv-deploy: parsed OK

  # From now on, to deploy a new version just run:
  /opt/cctv/deploy.sh

  # To update just the admin panel (Option B — built on VPS):
  # cd /opt/cctv/admin && git pull && npm run build && cp -r dist/* /var/www/cctv-admin/


────────────────────────────────────────────────────────────────────────────────
STEP 21 — GitHub Actions Auto-Deploy (Optional)
[Run on VPS, then configure on GitHub]
────────────────────────────────────────────────────────────────────────────────

  Every push to main → automatic deploy to the VPS. No manual SSH needed.

  ── Part A: Create the deploy SSH key on the VPS ─────────────────────────────

  # SSH into VPS as deploy:
  ssh deploy@<YOUR_VPS_IP>

  # Generate a dedicated key for GitHub Actions (no passphrase):
  ssh-keygen -t ed25519 -f ~/.ssh/github_actions_deploy -N ""

  # Authorize it for login:
  cat ~/.ssh/github_actions_deploy.pub >> ~/.ssh/authorized_keys
  chmod 600 ~/.ssh/authorized_keys

  # Print the PRIVATE key — you'll paste this into GitHub next:
  cat ~/.ssh/github_actions_deploy
  # Copy the entire output, from -----BEGIN OPENSSH PRIVATE KEY-----
  # to   -----END OPENSSH PRIVATE KEY-----  (inclusive)

  ── Part B: Add secrets to GitHub ────────────────────────────────────────────

  Go to: GitHub → your repo → Settings → Secrets and variables → Actions

  Click "New repository secret" and add three secrets:

    Name: VPS_HOST      Value: <YOUR_VPS_IP>
    Name: VPS_USER      Value: deploy
    Name: VPS_SSH_KEY   Value: <the private key you copied above>

  ── Part C: Create the workflow file (on your LOCAL machine) ──────────────────

  mkdir -p .github/workflows

  cat > .github/workflows/deploy.yml << 'EOF'
  name: Deploy to VPS

  on:
    push:
      branches: [main]

  jobs:
    deploy:
      name: SSH Deploy to VPS
      runs-on: ubuntu-latest

      steps:
        - name: Checkout repository
          uses: actions/checkout@v4

        - name: Deploy via SSH
          uses: appleboy/ssh-action@v1.0.3
          with:
            host:     ${{ secrets.VPS_HOST }}
            username: ${{ secrets.VPS_USER }}
            key:      ${{ secrets.VPS_SSH_KEY }}
            timeout:  300s
            script: |
              set -e
              echo "=== [1/4] Pulling latest code ==="
              cd /opt/cctv/backend
              git pull origin main

              echo "=== [2/4] Building Docker image ==="
              docker build -t cctv-backend:latest .

              echo "=== [3/4] Restarting service ==="
              sudo systemctl restart cctv-backend
              sleep 15

              echo "=== [4/4] Health check ==="
              curl -sf http://localhost:8080/health/live \
                && echo "Deployment OK" \
                || (echo "Health check FAILED" && exit 1)
  EOF

  # Commit and push the workflow:
  git add .github/workflows/deploy.yml
  git commit -m "ci: add GitHub Actions auto-deploy to VPS"
  git push origin main

  # Check the deployment running:
  # → Go to GitHub → your repo → Actions tab
  # → You should see the "Deploy to VPS" workflow running


================================================================================
APPENDIX A — Environment Variable Reference
================================================================================

  Variable                  Required   Default     Description
  ──────────────────────────────────────────────────────────────────────────────
  NODE_ENV                  YES        —           Must be "production"
  PORT                      YES        —           App port (use 8080)
  PUBLIC_BASE_URL           YES        —           Full HTTPS API URL
  MONGODB_URI               YES        —           MongoDB Atlas URI
  ACCESS_TOKEN_SECRET       YES        —           JWT signing key (≥48 bytes)
  REFRESH_TOKEN_SECRET      YES        —           JWT refresh key (≥48 bytes)
  ACCESS_TOKEN_EXPIRY       NO         15m         JWT access token lifetime
  REFRESH_TOKEN_EXPIRY      NO         30d         JWT refresh token lifetime
  OTP_EXPIRY_MINUTES        NO         10          OTP validity in minutes
  SMTP_HOST                 YES        —           SMTP server hostname
  SMTP_PORT                 NO         587         SMTP port
  SMTP_SECURE               NO         false       TLS on port 465
  SMTP_USER                 YES        —           SMTP login username
  SMTP_PASS                 YES        —           SMTP password / app password
  EMAIL_FROM                YES        —           "From" display name + address
  CLOUDINARY_CLOUD_NAME     YES        —           Cloudinary cloud name
  CLOUDINARY_API_KEY        YES        —           Cloudinary API key
  CLOUDINARY_API_SECRET     YES        —           Cloudinary API secret
  FIREBASE_PROJECT_ID       YES        —           Firebase project ID
  FIREBASE_CLIENT_EMAIL     YES        —           Firebase service account email
  FIREBASE_PRIVATE_KEY      YES        —           Firebase private key (PEM)
  RAZORPAY_KEY_ID           YES        —           Razorpay live key ID
  RAZORPAY_KEY_SECRET       YES        —           Razorpay live secret
  MEDIAMTX_URL              NO         127.0.0.1:8889   MediaMTX WebRTC URL
  MEDIAMTX_INTERNAL_HLS_URL NO         127.0.0.1:8888   MediaMTX HLS URL
  MEDIAMTX_INTERNAL_WEBRTC_URL NO      127.0.0.1:8889   MediaMTX WebRTC URL
  MEDIAMTX_API_URL          NO         127.0.0.1:9997/v3 MediaMTX API URL
  MEDIAMTX_STREAM_SECRET    YES        —           Stream auth secret (≥32 bytes)
  STREAM_TOKEN_EXPIRY       NO         24h         Stream token lifetime
  ENABLE_DEMO_FEEDS         NO         false       Set false in production
  RATE_LIMIT_WINDOW_MS      NO         900000      15-minute window
  RATE_LIMIT_MAX            NO         100         Max requests per window
  AUTH_RATE_LIMIT_MAX       NO         10          Max auth requests per window
  CORS_ORIGIN               YES        —           Comma-separated HTTPS origins
  SYSTEM_API_KEY            YES        —           Internal API key (≥32 bytes)


================================================================================
APPENDIX B — Troubleshooting Commands
================================================================================

  ── Container / App ──────────────────────────────────────────────────────────

  docker ps -a
  # All containers — see if cctv-backend is Up or Exited

  docker logs cctv-backend
  # Last ~100 lines of container output

  docker logs -f cctv-backend
  # Follow container logs live (Ctrl+C to stop)

  docker logs --since 5m cctv-backend
  # Only logs from the last 5 minutes

  docker exec -it cctv-backend sh
  # Open a shell inside the running container

  docker stats cctv-backend
  # Live CPU / memory / network usage

  docker inspect cctv-backend | grep -i "status\|error\|exit"
  # Check why a container exited

  ── systemd ──────────────────────────────────────────────────────────────────

  sudo systemctl status cctv-backend
  sudo systemctl restart cctv-backend
  sudo systemctl stop cctv-backend
  sudo journalctl -u cctv-backend -f
  sudo journalctl -u cctv-backend --since "1 hour ago"
  sudo journalctl -u cctv-backend -n 100

  ── Nginx ────────────────────────────────────────────────────────────────────

  sudo nginx -t
  # Test config for syntax errors before reloading

  sudo systemctl reload nginx
  # Apply config changes without downtime

  sudo systemctl restart nginx
  # Full restart (brief downtime)

  sudo tail -f /var/log/nginx/access.log
  sudo tail -f /var/log/nginx/error.log

  cat /etc/nginx/sites-available/cctv-api
  # View the current API virtual host config

  ── Firewall ─────────────────────────────────────────────────────────────────

  sudo ufw status verbose
  sudo ufw allow <port>/tcp
  sudo ufw deny <port>/tcp
  sudo ufw delete allow <port>/tcp

  ── SSL ──────────────────────────────────────────────────────────────────────

  sudo certbot certificates
  # List all certs and their expiry dates

  sudo certbot renew --dry-run
  # Test renewal without actually changing anything

  sudo certbot renew --force-renewal
  # Force renew all certs immediately (use sparingly — rate limits apply)

  openssl s_client -connect api.yourdomain.com:443 -servername api.yourdomain.com < /dev/null 2>&1 | grep -E 'subject|issuer|expire'
  # Raw TLS cert info

  ── System Resources ─────────────────────────────────────────────────────────

  df -h
  # Disk usage on all mounts

  du -sh /opt/cctv/* /var/www/* /var/log/* 2>/dev/null | sort -h
  # Which directories are using the most disk space

  free -h
  # RAM and swap usage

  htop
  # Interactive CPU/RAM monitor (press q to quit)

  sudo ss -tlnp
  # All listening TCP ports and which process owns them


================================================================================
APPENDIX C — Quick Reference One-Liners
================================================================================

  # Generate all required secrets in one go:
  echo "ACCESS_TOKEN_SECRET=$(openssl rand -hex 48)"
  echo "REFRESH_TOKEN_SECRET=$(openssl rand -hex 48)"
  echo "SYSTEM_API_KEY=$(openssl rand -hex 32)"
  echo "MEDIAMTX_STREAM_SECRET=$(openssl rand -hex 32)"

  # Full backend deploy (pull + build + restart + health check):
  /opt/cctv/deploy.sh

  # Test a specific API endpoint:
  curl -s https://api.yourdomain.com/health/ready | python3 -m json.tool

  # Check what's listening on key ports:
  sudo ss -tlnp | grep -E ':80|:443|:8080|:8554'

  # View health-check cron log:
  tail -f /var/log/cctv-healthcheck.log

  # Rebuild image only (no code pull):
  cd /opt/cctv/backend && docker build -t cctv-backend:latest . && sudo systemctl restart cctv-backend

  # Update admin panel from VPS (Option B):
  cd /opt/cctv/admin && git pull && npm run build && cp -r dist/* /var/www/cctv-admin/

  # Watch container resource usage live:
  watch -n2 docker stats cctv-backend

  # Backup .env to your local machine (run on LOCAL machine):
  scp deploy@<YOUR_VPS_IP>:/opt/cctv/backend/.env ~/cctv-prod.env.backup

  # Prune unused Docker images (free disk space):
  docker image prune -f

  # Prune ALL unused Docker objects (images, volumes, networks):
  docker system prune -f

  # Force-pull latest code and hard-reset (if you rebased on main):
  cd /opt/cctv/backend && git fetch origin && git reset --hard origin/main


================================================================================
END OF GUIDE
================================================================================
