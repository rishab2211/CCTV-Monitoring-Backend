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

    if (req.url.includes("talkback/whip") && req.method === "POST") {
      // DEBUG: intercept the WHIP request to see if 502 is from Cloudflare or MediaMTX
      res.writeHead(201, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Expose-Headers": "Location, Content-Type, Content-Length, Date, Server",
        "Content-Type": "application/sdp",
        "Location": req.url + "/debug123",
      });
      res.end("v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=Talkback\r\nc=IN IP4 127.0.0.1\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n");
      return;
    }

    const proxyHeaders = { ...req.headers };
    delete proxyHeaders["host"];
    delete proxyHeaders["connection"];
    delete proxyHeaders["transfer-encoding"];
    delete proxyHeaders["keep-alive"];

    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: targetPort,
      path: req.url.startsWith("/") ? req.url : `/${req.url}`,
      method: req.method,
      headers: {
        ...proxyHeaders,
        host: `127.0.0.1:${targetPort}`,
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      // Clean upstream headers to prevent duplicate header rejection in browsers
      const cleanHeaders = { ...proxyRes.headers };
      delete cleanHeaders["access-control-allow-origin"];
      delete cleanHeaders["access-control-allow-methods"];
      delete cleanHeaders["access-control-allow-headers"];
      delete cleanHeaders["access-control-expose-headers"];
      
      // Strip hop-by-hop headers
      delete cleanHeaders["transfer-encoding"];
      delete cleanHeaders["connection"];
      delete cleanHeaders["keep-alive"];

      const responseHeaders: http.OutgoingHttpHeaders = {
        ...cleanHeaders,
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
        "access-control-allow-headers": "*",
        "access-control-expose-headers": "Location, Content-Type, Content-Length, Date, Server",
      };

      res.writeHead(proxyRes.statusCode || 200, responseHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err: Error) => {
      logger.warn(`[StreamProxy] Error proxying to ${serviceName} (port ${targetPort}): ${err.message}`);
      if (!res.headersSent) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
        res.setHeader("Access-Control-Allow-Headers", "*");
        // Use 500 instead of 502 to prevent Cloudflare from intercepting and stripping CORS headers
        res.status(500).json({
          success: false,
          statusCode: 500,
          message: `${serviceName} is not reachable. Ensure MediaMTX is running on port ${targetPort}.`,
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
