const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 10000,
  path: '/webrtc/camera_6ac7b03e2e2bb26f7a83aa21_talkback/whip',
  method: 'POST',
  headers: {
    'Content-Type': 'application/sdp'
  }
};

const req = http.request(options, (res) => {
  console.log('STATUS:', res.statusCode);
  console.log('HEADERS:', res.headers);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (e) => {
  console.error(e);
});

req.write("v=0\no=- 0 0 IN IP4 127.0.0.1\ns=Talkback\nc=IN IP4 127.0.0.1\nt=0 0\nm=audio 9 UDP/TLS/RTP/SAVPF 111\na=rtpmap:111 opus/48000/2\na=sendonly\n");
req.end();
