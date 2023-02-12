const { readFileSync } = require('fs');
const { resolve } = require('path');

// server
const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 443;
const DOMAIN = 'meet.webrtc.com';
const BASE_URL = `https://${DOMAIN}:${PORT}`;
const CWD = process.cwd();
const SSL_KEY = readFileSync(resolve(CWD, 'ssl/server-key.pem'));
const SSL_CERT = readFileSync(resolve(CWD, 'ssl/server-cert.pem'));

// routes
const PEER_CONNECTION = 'peer-connection';
const LIVE_ROOM = 'live-room';
const TRANSPORT_CONTROL_AND_STAT = 'transport-control-and-stat';
const TEXT_CHAT = 'text-chat';

// room
const ROOM_SIZE = 2;

module.exports = {
  HOST,
  PORT,
  BASE_URL,
  SSL_KEY,
  SSL_CERT,
  PEER_CONNECTION,
  LIVE_ROOM,
  ROOM_SIZE,
  TRANSPORT_CONTROL_AND_STAT,
  TEXT_CHAT,
}