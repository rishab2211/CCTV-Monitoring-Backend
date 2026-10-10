const https = require('https');

const body = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=Talkback\r\nc=IN IP4 127.0.0.1\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n";

const options = {
  hostname: 'examined-shaved-resources-emissions.trycloudflare.com',
  port: 443,
  path: '/webrtc/camera_6ac7b03e2e2bb26f7a83aa21_talkback/whip',
  method: 'POST',
  headers: {
    'Content-Type': 'application/sdp',
    'Content-Length': Buffer.byteLength(body)
  }
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

req.write(body);
req.end();
