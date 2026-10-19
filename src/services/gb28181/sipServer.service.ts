/**
 * @file sipServer.service.ts
 * @description Sovereign GB/T 28181 SIP Signaling Server (RFC 3261 + GB/T 28181-2016).
 * Handles inbound device registration with HTTP Digest Authentication (RFC 2617),
 * periodic SIP keepalive tracking for NAT traversal, and outbound MANSCDP PTZ control dispatch.
 */

import dgram from "dgram";
import crypto from "crypto";
import { Camera, CameraDocument } from "../../models/Camera";
import { logger } from "../../utils/logger";
import { socketService } from "../socket.service";
import { buildDeviceControlXml, extractXmlTag, buildCatalogQueryXml } from "../../utils/gb28181";

interface RegisteredDevice {
  deviceId: string;
  cameraId: string;
  address: string;
  port: number;
  lastPing: Date;
  callId?: string;
  fromTag?: string;
  cseq: number;
}

class Gb28181SipServer {
  private socket: dgram.Socket | null = null;
  private port: number = parseInt(process.env.GB28181_SIP_PORT || "5060", 10);
  private serverDomain: string = process.env.GB28181_SIP_DOMAIN || "3402000000";
  private serverId: string = process.env.GB28181_SERVER_ID || "34020000002000000001";
  private registeredDevices: Map<string, RegisteredDevice> = new Map();
  private pendingNonces: Map<string, { nonce: string; timestamp: number }> = new Map();
  private isRunning: boolean = false;

  /**
   * Initializes and binds the UDP SIP socket.
   */
  public start(): void {
    if (this.isRunning) return;

    try {
      this.socket = dgram.createSocket("udp4");

      this.socket.on("error", (err: any) => {
        if (err.code === "EACCES") {
          logger.warn(
            `⚠️ [GB28181] Port ${this.port} requires root privileges or CAP_NET_BIND_SERVICE. Falling back to passive mode.`
          );
        } else if (err.code === "EADDRINUSE") {
          logger.warn(
            `⚠️ [GB28181] Port ${this.port} is already in use (e.g., ZLMediaKit). Operating in webhook-cooperative mode.`
          );
        } else {
          logger.error(`[GB28181] UDP Socket Error: ${err.message}`);
        }
      });

      this.socket.on("message", (msg, rinfo) => {
        this.handleIncomingMessage(msg.toString("utf-8"), rinfo);
      });

      this.socket.bind(this.port, () => {
        this.isRunning = true;
        logger.info(
          `📡 [GB28181] SIP Server listening on UDP :${this.port} (Domain: ${this.serverDomain}, ServerID: ${this.serverId})`
        );
      });
    } catch (error: any) {
      logger.warn(`⚠️ [GB28181] Could not initialize SIP socket: ${error.message}`);
    }
  }

  /**
   * Shuts down the SIP listener cleanly.
   */
  public stop(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }
    this.isRunning = false;
  }

  /**
   * Core SIP message dispatcher.
   */
  private handleIncomingMessage(rawMessage: string, rinfo: dgram.RemoteInfo): void {
    try {
      const lines = rawMessage.split("\r\n");
      const firstLine = lines[0] || "";

      // Extract SIP method or response code
      const methodMatch = firstLine.match(/^([A-Z]+)\s+/);
      const method = methodMatch ? methodMatch[1] : "";

      switch (method) {
        case "REGISTER":
          this.handleRegister(rawMessage, rinfo);
          break;
        case "MESSAGE":
          this.handleMessage(rawMessage, rinfo);
          break;
        case "BYE":
        case "CANCEL":
          this.sendSipResponse("200 OK", rawMessage, rinfo);
          break;
        default:
          // Acknowledge other standard requests
          if (method) {
            this.sendSipResponse("200 OK", rawMessage, rinfo);
          }
          break;
      }
    } catch (err: any) {
      logger.error(`[GB28181] Error parsing SIP packet from ${rinfo.address}:${rinfo.port}: ${err.message}`);
    }
  }

  /**
   * Handles SIP REGISTER with HTTP Digest Authentication (RFC 2617 / RFC 3261).
   */
  private async handleRegister(rawMessage: string, rinfo: dgram.RemoteInfo): Promise<void> {
    const authHeader = this.getHeader(rawMessage, "Authorization");
    const fromHeader = this.getHeader(rawMessage, "From") || "";
    const callId = this.getHeader(rawMessage, "Call-ID") || "";

    // Extract device ID from From header: <sip:34020000001320000001@3402000000>
    const idMatch = fromHeader.match(/sip:([0-9a-zA-Z_-]+)@/);
    const deviceId = idMatch ? idMatch[1] : "";

    if (!deviceId) {
      logger.warn(`[GB28181] Malformed REGISTER request without device ID from ${rinfo.address}:${rinfo.port}`);
      this.sendSipResponse("400 Bad Request", rawMessage, rinfo);
      return;
    }

    // Step 1: Challenge if no Authorization header provided
    if (!authHeader) {
      this.pruneStaleNonces();
      const nonce = crypto.randomBytes(16).toString("hex");
      this.pendingNonces.set(deviceId, { nonce, timestamp: Date.now() });

      const challengeHeaders = [
        `WWW-Authenticate: Digest realm="${this.serverDomain}", nonce="${nonce}", algorithm=MD5, qop="auth"`,
      ];
      this.sendSipResponse("401 Unauthorized", rawMessage, rinfo, challengeHeaders);
      return;
    }

    // Step 2: Validate Digest credentials
    const authParams = this.parseDigestParams(authHeader);
    const username = authParams.username || deviceId;
    const nonce = authParams.nonce;
    const response = authParams.response;
    const uri = authParams.uri || `sip:${this.serverDomain}@${rinfo.address}`;

    // Find camera in MongoDB by gb28181.deviceId or serialNumber
    const camera = await Camera.findOne({
      $or: [
        { "gb28181.deviceId": username },
        { serialNumber: username },
        { "gb28181.deviceId": deviceId },
      ],
      isDeleted: false,
    });

    if (!camera) {
      logger.warn(`[GB28181] Unknown device attempted registration: ${username} from ${rinfo.address}:${rinfo.port}`);
      this.sendSipResponse("403 Forbidden", rawMessage, rinfo);
      return;
    }

    const sipPassword = camera.gb28181?.sipPassword || "cctv_secret_pass";

    // RFC 2617 & RFC 2069 MD5 Verification
    const ha1 = crypto.createHash("md5").update(`${username}:${this.serverDomain}:${sipPassword}`).digest("hex");
    const ha2 = crypto.createHash("md5").update(`REGISTER:${uri}`).digest("hex");

    // Standard RFC 2069 calculation
    const rfc2069Expected = crypto.createHash("md5").update(`${ha1}:${nonce}:${ha2}`).digest("hex");

    // RFC 2617 calculation with qop (auth)
    let rfc2617Expected: string | null = null;
    const qop = authParams.qop ? authParams.qop.replace(/"/g, "").trim() : null;
    if (qop) {
      const nc = authParams.nc || "00000001";
      const cnonce = authParams.cnonce || "";
      rfc2617Expected = crypto
        .createHash("md5")
        .update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
        .digest("hex");
    }

    const respLower = (response || "").toLowerCase();
    const isRfc2069Valid = respLower === rfc2069Expected.toLowerCase();
    const isRfc2617Valid = rfc2617Expected ? respLower === rfc2617Expected.toLowerCase() : false;

    if (!isRfc2069Valid && !isRfc2617Valid) {
      logger.warn(`[GB28181] Auth failed for camera ${camera.name} (${username}). Invalid password or response mismatch.`);
      const freshNonce = crypto.randomBytes(16).toString("hex");
      this.pendingNonces.set(deviceId, { nonce: freshNonce, timestamp: Date.now() });
      this.sendSipResponse("401 Unauthorized", rawMessage, rinfo, [
        `WWW-Authenticate: Digest realm="${this.serverDomain}", nonce="${freshNonce}", algorithm=MD5, qop="auth"`,
      ]);
      return;
    }

    // Clean up nonce upon successful verification to avoid memory leaks
    this.pendingNonces.delete(deviceId);

    // Step 3: Registration Success!
    this.sendSipResponse("200 OK", rawMessage, rinfo, [
      `Date: ${new Date().toISOString()}`,
      `Expires: 3600`,
    ]);

    // Store in active NAT device cache
    this.registeredDevices.set(deviceId, {
      deviceId,
      cameraId: camera._id.toString(),
      address: rinfo.address,
      port: rinfo.port,
      lastPing: new Date(),
      callId,
      cseq: 1,
    });

    // Update DB with online status and NAT mapping
    camera.status = "online";
    if (!camera.gb28181) {
      camera.gb28181 = {
        deviceId,
        serverId: this.serverId,
        serverDomain: this.serverDomain,
        sipPort: this.port,
        heartbeatInterval: 60,
      } as any;
    }
    const gb = camera.gb28181;
    if (gb) {
      gb.lastKeepalive = new Date();
      gb.natIp = rinfo.address;
      gb.natPort = rinfo.port;
    }
    camera.health.lastPing = new Date();
    await camera.save();

    socketService.emitToCamera(camera._id.toString(), "camera_online", {
      cameraId: camera._id,
      streamMode: "gb28181",
      natIp: rinfo.address,
      natPort: rinfo.port,
    });

    logger.info(
      `✅ [GB28181] Camera REGISTERED: "${camera.name}" (DeviceID: ${deviceId}) from ${rinfo.address}:${rinfo.port}`
    );

    // Query device catalog
    this.sendCatalogQuery(camera, deviceId, rinfo.address, rinfo.port);
  }

  /**
   * Handles SIP MESSAGE (Keepalives, Catalog responses, Alarms).
   */
  private async handleMessage(rawMessage: string, rinfo: dgram.RemoteInfo): Promise<void> {
    this.sendSipResponse("200 OK", rawMessage, rinfo);

    const bodyIndex = rawMessage.indexOf("\r\n\r\n");
    if (bodyIndex === -1) return;
    const body = rawMessage.slice(bodyIndex + 4);

    const cmdType = extractXmlTag(body, "CmdType");
    const deviceId = extractXmlTag(body, "DeviceID");

    if (cmdType === "Keepalive" && deviceId) {
      // Update NAT registration cache
      const cached = this.registeredDevices.get(deviceId);
      if (cached) {
        cached.lastPing = new Date();
        cached.address = rinfo.address;
        cached.port = rinfo.port;
      }

      // Update DB keepalive
      await Camera.updateOne(
        { "gb28181.deviceId": deviceId, isDeleted: false },
        {
          $set: {
            status: "online",
            "gb28181.lastKeepalive": new Date(),
            "gb28181.natIp": rinfo.address,
            "gb28181.natPort": rinfo.port,
            "health.lastPing": new Date(),
          },
        }
      );
    }
  }

  /**
   * Dispatches PTZ command via SIP MESSAGE over the camera's established NAT pinhole.
   */
  public async sendPTZCommand(camera: CameraDocument, ptzCmdHex: string): Promise<boolean> {
    const deviceId = camera.gb28181?.deviceId || camera.serialNumber;
    let target = this.registeredDevices.get(deviceId);

    // If not in memory, use last known NAT mapping from DB
    if (!target && camera.gb28181?.natIp && camera.gb28181?.natPort) {
      target = {
        deviceId,
        cameraId: camera._id.toString(),
        address: camera.gb28181.natIp,
        port: camera.gb28181.natPort,
        lastPing: camera.gb28181.lastKeepalive || new Date(),
        cseq: 10,
      };
    }

    if (!target || !this.socket) {
      logger.warn(`[GB28181] Cannot send PTZ to camera ${camera.name}: Device is not registered or socket inactive`);
      return false;
    }

    target.cseq += 1;
    const sn = Math.floor(100000 + Math.random() * 900000);
    const xmlBody = buildDeviceControlXml(sn, deviceId, ptzCmdHex);

    const sipRequest =
      `MESSAGE sip:${deviceId}@${target.address}:${target.port} SIP/2.0\r\n` +
      `Via: SIP/2.0/UDP ${this.serverDomain}:${this.port};branch=z9hG4bK${Date.now()}\r\n` +
      `From: <sip:${this.serverId}@${this.serverDomain}>;tag=ptz_${Date.now()}\r\n` +
      `To: <sip:${deviceId}@${this.serverDomain}>\r\n` +
      `Call-ID: ptz_call_${sn}_${Date.now()}\r\n` +
      `CSeq: ${target.cseq} MESSAGE\r\n` +
      `Content-Type: Application/MANSCDP+xml\r\n` +
      `Max-Forwards: 70\r\n` +
      `User-Agent: CCTV-Cloud-Platform-GB28181\r\n` +
      `Content-Length: ${Buffer.byteLength(xmlBody, "utf-8")}\r\n\r\n` +
      xmlBody;

    return new Promise((resolve) => {
      this.socket?.send(sipRequest, target!.port, target!.address, (err) => {
        if (err) {
          logger.error(`[GB28181] Failed to dispatch PTZ command to ${camera.name}: ${err.message}`);
          resolve(false);
        } else {
          logger.info(`🎮 [GB28181] PTZ Command sent to ${camera.name} [${ptzCmdHex}] via ${target!.address}:${target!.port}`);
          resolve(true);
        }
      });
    });
  }

  /**
   * Queries catalog information from the camera upon initial registration.
   */
  private sendCatalogQuery(camera: CameraDocument, deviceId: string, address: string, port: number): void {
    if (!this.socket) return;
    const sn = Math.floor(100000 + Math.random() * 900000);
    const xmlBody = buildCatalogQueryXml(sn, deviceId);

    const sipRequest =
      `MESSAGE sip:${deviceId}@${address}:${port} SIP/2.0\r\n` +
      `Via: SIP/2.0/UDP ${this.serverDomain}:${this.port};branch=z9hG4bK${Date.now()}\r\n` +
      `From: <sip:${this.serverId}@${this.serverDomain}>;tag=cat_${Date.now()}\r\n` +
      `To: <sip:${deviceId}@${this.serverDomain}>\r\n` +
      `Call-ID: cat_call_${sn}\r\n` +
      `CSeq: 1 MESSAGE\r\n` +
      `Max-Forwards: 70\r\n` +
      `Content-Type: Application/MANSCDP+xml\r\n` +
      `Content-Length: ${Buffer.byteLength(xmlBody, "utf-8")}\r\n\r\n` +
      xmlBody;

    this.socket.send(sipRequest, port, address, () => {});
  }

  /**
   * Builds and sends standard SIP response (200 OK, 401 Unauthorized, etc.).
   * Strictly adheres to RFC 3261 Section 8.2.6.2 (To tag requirement on UAS responses).
   */
  private sendSipResponse(
    statusCode: string,
    reqMessage: string,
    rinfo: dgram.RemoteInfo,
    extraHeaders: string[] = []
  ): void {
    if (!this.socket) return;

    const via = this.getHeader(reqMessage, "Via");
    const from = this.getHeader(reqMessage, "From");
    const to = this.getHeader(reqMessage, "To");
    const callId = this.getHeader(reqMessage, "Call-ID");
    const cseq = this.getHeader(reqMessage, "CSeq");

    let response = `SIP/2.0 ${statusCode}\r\n`;
    if (via) response += `Via: ${via}\r\n`;
    if (from) response += `From: ${from}\r\n`;

    // RFC 3261 Section 8.2.6.2: UAS response MUST add a tag to the To header if not present
    let toHeader = to || "";
    if (toHeader && !toHeader.toLowerCase().includes(";tag=")) {
      toHeader += `;tag=srv_${Date.now()}`;
    }
    if (toHeader) response += `To: ${toHeader}\r\n`;

    if (callId) response += `Call-ID: ${callId}\r\n`;
    if (cseq) response += `CSeq: ${cseq}\r\n`;
    response += `User-Agent: CCTV-Cloud-Platform-GB28181\r\n`;

    for (const h of extraHeaders) {
      response += `${h}\r\n`;
    }

    response += `Content-Length: 0\r\n\r\n`;

    this.socket.send(response, rinfo.port, rinfo.address, () => {});
  }

  /**
   * Parses specific header from SIP raw message string.
   */
  private getHeader(raw: string, headerName: string): string | null {
    const lines = raw.split("\r\n");
    for (const line of lines) {
      if (line.toLowerCase().startsWith(`${headerName.toLowerCase()}:`)) {
        return line.slice(headerName.length + 1).trim();
      }
    }
    return null;
  }

  /**
   * Parses Authorization: Digest header parameters into key-value map.
   * Robust against commas inside quotes, unquoted values, and nested equal signs.
   */
  private parseDigestParams(authHeader: string): Record<string, string> {
    const params: Record<string, string> = {};
    const clean = authHeader.replace(/^Digest\s+/i, "");
    const regex = /([a-zA-Z0-9_-]+)\s*=\s*("[^"]*"|[^,]*)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(clean)) !== null) {
      const key = match[1].trim();
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      params[key] = val;
    }
    return params;
  }

  /**
   * Evicts nonce challenges older than 5 minutes to prevent memory leaks.
   */
  private pruneStaleNonces(): void {
    const now = Date.now();
    for (const [key, entry] of this.pendingNonces.entries()) {
      if (now - entry.timestamp > 300000) {
        this.pendingNonces.delete(key);
      }
    }
  }
}

export const sipServerService = new Gb28181SipServer();
