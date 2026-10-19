/**
 * @file gb28181.routes.ts
 * @description ZLMediaKit & GB28181 Gateway Webhook Endpoints.
 * Intercepts media server callbacks (on_publish, on_play, on_none_reader)
 * to automatically reconcile camera online state and authorize inbound RTP publishers.
 */

import { Router, Request, Response } from "express";
import { Camera } from "../../models/Camera";
import { socketService } from "../../services/socket.service";
import { logger } from "../../utils/logger";

const router = Router();

/**
 * POST /api/v1/gb28181/webhook/on-publish
 * Invoked by ZLMediaKit when an incoming GB28181 PS-RTP stream begins publishing.
 */
router.post("/webhook/on-publish", async (req: Request, res: Response) => {
  try {
    const { id, stream, app, ip, port } = req.body;
    const streamId = id || stream;

    logger.info(`📡 [GB28181 Hook] on_publish received: app=${app}, stream=${streamId} from ${ip}:${port}`);

    if (streamId) {
      const camera = await Camera.findOne({
        $or: [
          { "gb28181.deviceId": streamId },
          { serialNumber: streamId },
        ],
        isDeleted: false,
      });

      if (camera) {
        camera.status = "online";
        camera.health.lastPing = new Date();
        if (camera.gb28181) {
          camera.gb28181.lastKeepalive = new Date();
          if (ip) camera.gb28181.natIp = ip;
          if (port) camera.gb28181.natPort = Number(port);
        }
        await camera.save();

        socketService.emitToCamera(camera._id.toString(), "camera_online", {
          cameraId: camera._id.toString(),
          streamMode: "gb28181",
          serialNumber: camera.serialNumber,
        });

        logger.info(`✅ [GB28181 Hook] Stream verified for camera "${camera.name}" (${camera.serialNumber})`);
      }
    }

    // code: 0 tells ZLMediaKit to accept and forward the stream
    return res.status(200).json({ code: 0, msg: "success" });
  } catch (err: any) {
    logger.error(`[GB28181 Hook] Error handling on_publish: ${err.message}`);
    // Return success code so ZLMediaKit doesn't drop the camera stream during transient DB hiccups
    return res.status(200).json({ code: 0, msg: "success" });
  }
});

/**
 * POST /api/v1/gb28181/webhook/on-play
 * Invoked when a reader subscribes to the stream.
 */
router.post("/webhook/on-play", (_req: Request, res: Response) => {
  return res.status(200).json({ code: 0, msg: "success" });
});

/**
 * POST /api/v1/gb28181/webhook/on-none-reader
 * Invoked when all readers disconnect from the stream.
 */
router.post("/webhook/on-none-reader", (_req: Request, res: Response) => {
  // close: false ensures the stream remains open for continuous recording
  return res.status(200).json({ code: 0, close: false, msg: "success" });
});

/**
 * POST /api/v1/gb28181/webhook/on-stream-not-found
 */
router.post("/webhook/on-stream-not-found", (_req: Request, res: Response) => {
  return res.status(200).json({ code: 0, msg: "success" });
});

/**
 * POST /api/v1/gb28181/webhook/on-stream-changed
 */
router.post("/webhook/on-stream-changed", async (req: Request, res: Response) => {
  try {
    const { id, stream, regist } = req.body;
    const streamId = id || stream;

    if (streamId && regist === false) {
      logger.info(`📴 [GB28181 Hook] Stream unpublished: ${streamId}`);
    }
  } catch (err: any) {
    logger.warn(`[GB28181 Hook] on_stream_changed error: ${err.message}`);
  }
  return res.status(200).json({ code: 0, msg: "success" });
});

export default router;
