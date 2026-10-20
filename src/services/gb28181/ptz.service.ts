/**
 * @file ptz.service.ts
 * @description Service for issuing PTZ motor commands to physical IP cameras
 * via GB/T 28181 MANSCDP XML over SIP socket.
 */

import { Camera, CameraDocument } from "../../models/Camera";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";
import { buildPTZCmd } from "../../utils/gb28181";
import { sipServerService } from "./sipServer.service";
import { socketService } from "../socket.service";
import { PTZDirection } from "../../types";
import { toPathName } from "../../config/mediamtx.service";

export interface SendPtzInput {
  cameraId: string;
  direction: PTZDirection;
  speed?: number;
}

const lastCmdTimeMap = new Map<string, number>();
const PTZ_MIN_INTERVAL_MS = 120;

/**
 * Dispatches a directional PTZ movement command to a camera.
 */
export const dispatchPtzCommand = async (input: SendPtzInput): Promise<{
  success: boolean;
  cameraId: string;
  direction: PTZDirection;
  ptzCmdHex: string;
}> => {
  const { cameraId, direction, speed = 32 } = input;

  const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
  if (!camera) {
    throw ApiError.notFound("Camera");
  }

  // Calculate 8-byte GB28181 hex code
  const ptzCmdHex = buildPTZCmd(direction, speed);

  // Throttle rapid non-stop movement commands to avoid overflowing camera SIP stack
  if (direction !== "stop") {
    const lastTime = lastCmdTimeMap.get(cameraId) || 0;
    const now = Date.now();
    if (now - lastTime < PTZ_MIN_INTERVAL_MS) {
      return {
        success: true,
        cameraId,
        direction,
        ptzCmdHex,
      };
    }
    lastCmdTimeMap.set(cameraId, now);
  } else {
    lastCmdTimeMap.set(cameraId, 0);
  }

  // Send via GB28181 SIP Server
  const sent = await sipServerService.sendPTZCommand(camera, ptzCmdHex);

  // Emit real-time feedback over Socket.IO so all dashboard observers see the motor state
  const payload = {
    cameraId,
    direction,
    speed,
    ptzCmdHex,
    success: sent,
    timestamp: new Date(),
  };

  socketService.emitToCamera(cameraId, "camera_ptz_moved", payload);
  const slug = toPathName(camera.serialNumber);
  if (slug && slug !== cameraId) {
    socketService.emitToCamera(slug, "camera_ptz_moved", payload);
  }

  logger.info(`🎮 PTZ Command [${direction}] issued to camera "${camera.name}" (Result: ${sent ? "OK" : "QUEUED"})`);

  return {
    success: sent,
    cameraId,
    direction,
    ptzCmdHex,
  };
};
