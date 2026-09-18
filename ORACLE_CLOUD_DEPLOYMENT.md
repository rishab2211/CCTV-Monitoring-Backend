# 🚀 Oracle Cloud "Always Free" Deployment Guide
## CCTV Monitoring Platform & MediaMTX WebRTC Live Streaming

This guide walks you through deploying the CCTV Monitoring Backend, MediaMTX WebRTC streaming gateway, and synthetic CCTV demo feeds onto an **Oracle Cloud Infrastructure (OCI) Always Free** VM.

---

## 🏗️ Architecture on Oracle Cloud

```
┌─────────────────────────────────────────────────────────────┐
│  Client Browser (Admin Panel on Vercel)                     │
│  https://cctv-monitoring-admin-panel.vercel.app             │
└──────────────┬──────────────────────────────▲───────────────┘
               │ HTTPS (API / WHEP Offer)      │ WebRTC (UDP RTP Video)
               ▼                               │ Port 8189
┌──────────────────────────────────────────────┴──────────────┐
│  Oracle Cloud Always Free VM (Dedicated Public IP)          │
│                                                             │
│  ┌────────────────────────┐   ┌──────────────────────────┐  │
│  │ Caddy (Port 80 / 443)  │   │ MediaMTX Gateway         │  │
│  │ Auto Let's Encrypt SSL │──▶│ Port 8889 (WHEP)         │  │
│  └───────────┬────────────┘   │ Port 8189 (WebRTC Media) │  │
│              │                │ Port 8554 (RTSP)         │  │
│              ▼                └─────────────▲────────────┘  │
│  ┌────────────────────────┐                 │ RTSP Feeds    │
│  │ CCTV Backend API       │                 │               │
│  │ Bun / Express (Port 5000)                │               │
│  └────────────────────────┘                 │               │
│                                             │               │
│  ┌──────────────────────────────────────────┴────────────┐  │
│  │ Background Synthetic CCTV Feeds (FFmpeg)              │  │
│  │ CAM-ENTRANCE-01, CAM-WAREHOUSE-02, CAM-PARKING-03    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 1: Create Your Always Free Instance on OCI

1. Log into your [Oracle Cloud Console](https://cloud.oracle.com).
2. Go to **Compute** > **Instances** > **Create Instance**.
3. **Name:** `cctv-streaming-server`
4. **Placement:** Default Availability Domain.
5. **Image and Shape:**
   - **Image:** `Ubuntu 22.04 LTS` or `Ubuntu 24.04 LTS` (Canonical Ubuntu).
   - **Shape:** Click **Change Shape**:
     - *Recommended (Ampere ARM):* **Ampere VM.Standard.A1.Flex** (Choose 2 or 4 OCPU, 12 or 24 GB RAM — **Always Free Eligible**).
     - *Alternative (AMD x86):* **VM.Standard.E2.1.Micro** (1 OCPU, 1 GB RAM — **Always Free Eligible**).
6. **Networking:**
   - Select **Assign a public IPv4 address**.
7. **Add SSH Keys:**
   - Choose **Generate a key pair for me** and click **Save Private Key** (e.g. `ssh-key.key`).
8. Click **Create** and wait ~60 seconds until the instance state changes to **Running**.
9. Note your **Public IP Address** (e.g., `129.153.100.50`).

---

## Step 2: Open Ports in Oracle Cloud Security List

Oracle Cloud blocks all traffic except SSH (port 22) by default. You must open the ports in the VCN:

1. In the instance details page, under **Instance Information**, click on your **Virtual Cloud Network** (e.g., `vcn-...`).
2. On the left sidebar, click **Security Lists**, then click **Default Security List for vcn-...**.
3. Click **Add Ingress Rules** and add the following two rules:

### Rule A: HTTP / HTTPS / RTSP / WebRTC TCP Ports
- **Source Type:** `CIDR`
- **Source CIDR:** `0.0.0.0/0`
- **IP Protocol:** `TCP`
- **Destination Port Range:** `80,443,5000,8554,8889`
- **Description:** `CCTV Web, API, RTSP, and MediaMTX WHEP`

### Rule B: WebRTC UDP Media Port
- **Source Type:** `CIDR`
- **Source CIDR:** `0.0.0.0/0`
- **IP Protocol:** `UDP`
- **Destination Port Range:** `8189`
- **Description:** `MediaMTX WebRTC RTP Media`

4. Click **Add Ingress Rules**.

---

## Step 3: Connect via SSH & Open the OS Firewall

Connect to your instance using your terminal:
```bash
chmod 400 ssh-key.key
ssh -i ssh-key.key ubuntu@<YOUR_PUBLIC_IP>
```

Ubuntu on Oracle Cloud includes default `iptables` rules that reject inbound connections. Run these commands to allow the required ports:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp -m multiport --dports 80,443,5000,8554,8889 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 8189 -j ACCEPT
sudo apt-get update && sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

---

## Step 4: Install Docker & Docker Compose

Run on the VM:
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-compose
sudo usermod -aG docker $USER
newgrp docker
```

---

## Step 5: Deploy the Application Stack

1. Clone your backend repository onto the VM:
```bash
git clone <YOUR_BACKEND_REPO_URL> cctv-backend
cd cctv-backend
```

2. Create your `.env` file:
```bash
cp env.example .env
nano .env
```
Fill in your configuration:
- `MONGODB_URI`: Your MongoDB Atlas connection string.
- `ACCESS_TOKEN_SECRET`: Random 32+ char string.
- `REFRESH_TOKEN_SECRET`: Random 32+ char string.
- `CORS_ORIGIN`: `https://cctv-monitoring-admin-panel.vercel.app`
- `PUBLIC_IP`: `<YOUR_VM_PUBLIC_IP>` (e.g. `129.153.100.50`)
- `DOMAIN`: `<YOUR_VM_PUBLIC_IP>.sslip.io` (e.g. `129.153.100.50.sslip.io`)
- `EMAIL`: Your email address for Let's Encrypt SSL.

> 💡 **Why `sslip.io`?**  
> `sslip.io` is a free wildcard DNS service. `129.153.100.50.sslip.io` automatically resolves to `129.153.100.50`. Caddy uses this to automatically obtain a **free, valid Let's Encrypt SSL certificate** with zero setup and zero domain purchase!

3. Build and launch all services:
```bash
docker-compose up -d --build
```

4. Check the logs:
```bash
docker-compose logs -f
```
You will see:
- MediaMTX started on ports `8554`, `8889`, and `8189`.
- Synthetic feeds broadcasting `cam_entrance`, `cam_warehouse`, and `cam_parking`.
- CCTV Backend listening on port `5000`.
- Caddy issuing an SSL certificate for `https://<YOUR_IP>.sslip.io`.

---

## Step 6: Seed the Demo Data (Cameras & Accounts)

Populate the database with pre-configured demo users and cameras:
```bash
docker exec -it cctv_backend bun scripts/seed-demo-data.ts
```

This registers the 3 cameras and sets their stream URLs to:
- `rtsp://localhost:8554/cam_entrance`
- `rtsp://localhost:8554/cam_warehouse`
- `rtsp://localhost:8554/cam_parking`

Demo accounts created:
- **Super Admin:** `admin@cctv.com` / `Admin@123`
- **Franchise Admin:** `franchise@cctv.com` / `Franchise@123`
- **Operator:** `operator@cctv.com` / `Operator@123`
- **Customer:** `customer@cctv.com` / `Customer@123`

---

## Step 7: Update Vercel Admin Panel

1. Go to your [Vercel Dashboard](https://vercel.com).
2. Select your `cctv-monitoring-admin-panel` project > **Settings** > **Environment Variables**.
3. Update the following environment variables:
   - `VITE_API_BASE_URL`: `https://<YOUR_VM_PUBLIC_IP>.sslip.io/api/v1`
   - `VITE_SOCKET_URL`: `https://<YOUR_VM_PUBLIC_IP>.sslip.io`
4. Go to **Deployments** > Click **...** on the latest deployment > **Redeploy**.

---

## 🎯 Verification Checklist

1. Open `https://<YOUR_VM_PUBLIC_IP>.sslip.io/api/v1/health` in your browser:  
   👉 Returns `{"status":"ok", ...}` with valid SSL certificate lock icon.
2. Open your Vercel URL (`https://cctv-monitoring-admin-panel.vercel.app`).
3. Log in with `admin@cctv.com` / `Admin@123`.
4. Go to **Live Grid** or **Cameras**:  
   👉 All 3 cameras will instantly stream real-time 30 FPS video with running timestamp overlays, sub-second WebRTC latency, and telemetry HUD!
