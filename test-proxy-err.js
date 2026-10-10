const express = require('express');
const http = require('http');

const app = express();

app.use("/webrtc", (req, res, next) => {
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

    const proxyHeaders = { ...req.headers };
    delete proxyHeaders["host"];
    delete proxyHeaders["connection"];
    delete proxyHeaders["transfer-encoding"];
    delete proxyHeaders["keep-alive"];

    const options = {
      hostname: "127.0.0.1",
      port: 8899, // Unused port to trigger ECONNREFUSED
      path: req.url.startsWith("/") ? req.url : `/${req.url}`,
      method: req.method,
      headers: {
        ...proxyHeaders,
        host: `127.0.0.1:8899`,
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const cleanHeaders = { ...proxyRes.headers };
      delete cleanHeaders["access-control-allow-origin"];
      delete cleanHeaders["access-control-allow-methods"];
      delete cleanHeaders["access-control-allow-headers"];
      delete cleanHeaders["access-control-expose-headers"];
      
      delete cleanHeaders["transfer-encoding"];
      delete cleanHeaders["connection"];
      delete cleanHeaders["keep-alive"];

      const responseHeaders = {
        ...cleanHeaders,
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
        "access-control-allow-headers": "*",
        "access-control-expose-headers": "Location, Content-Type, Content-Length, Date, Server",
      };

      res.writeHead(proxyRes.statusCode || 200, responseHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error("PROXY ERR:", err.message);
      if (!res.headersSent) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
        res.setHeader("Access-Control-Allow-Headers", "*");
        res.status(502).json({
          success: false,
          statusCode: 502,
          message: `Service not reachable`,
          error: err.message,
        });
      }
    });

    req.pipe(proxyReq);
});

app.listen(10002, () => {
    console.log("Proxy listening on 10002");
});
