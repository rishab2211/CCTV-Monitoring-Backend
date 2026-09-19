import http from "http";
import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

/**
 * Creates a reverse-proxy middleware that streams HTTP requests directly
 * to internal MediaMTX services (HLS on 8888, WebRTC/WHEP on 8889).
 *
 * This allows all video streaming and WHEP signaling to flow through
 * Render's single exposed port (10000) with zero external port conflicts.
 */
export const createMediaProxy = (targetPort: number, serviceName: string) => {
  return (req: Request, res: Response, _next: NextFunction): void => {
    // Handle CORS preflight immediately for video players and browsers
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }

    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${targetPort}`,
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      // Build response headers with permissive CORS for embedding in any dashboard/app
      const responseHeaders: http.OutgoingHttpHeaders = {
        ...proxyRes.headers,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Expose-Headers": "Location, Content-Type, Content-Length, Date, Server",
      };

      res.writeHead(proxyRes.statusCode || 200, responseHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err: Error) => {
      logger.warn(`[StreamProxy] Error proxying to ${serviceName} (port ${targetPort}): ${err.message}`);
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          statusCode: 502,
          message: `${serviceName} is not reachable. Ensure MediaMTX is running.`,
          error: err.message,
        });
      }
    });

    // Handle client disconnect gracefully
    req.on("close", () => {
      proxyReq.destroy();
    });

    req.pipe(proxyReq);
  };
};
