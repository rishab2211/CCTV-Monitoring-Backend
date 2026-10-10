const http = require('http');
const https = require('https');

const options = {
  hostname: 'examined-shaved-resources-emissions.trycloudflare.com',
  port: 443,
  path: '/webrtc/camera_6ac7b03e2e2bb26f7a83aa21_talkback/whip',
  method: 'OPTIONS',
};

const req = https.request(options, (res) => {
  console.log('STATUS:', res.statusCode);
  console.log('HEADERS:', res.headers);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (e) => {
  console.error(e);
});

req.end();
