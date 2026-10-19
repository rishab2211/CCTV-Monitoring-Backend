/**
 * @file gb28181.ts
 * @description Utilities for GB/T 28181-2016 standard protocols.
 * Includes 20-digit national device ID generation, MANSCDP XML serialization,
 * and 8-byte PTZ bytecode calculation.
 */

import type { PTZDirection } from "../types";

/**
 * Generates a 20-digit standard GB/T 28181-2016 Device ID.
 * Format:
 *   [0-5]   Area Code (default: 340200)
 *   [6-7]   Department Code (00 = Public security / Civil)
 *   [8-10]  Device Type Code (132 = Network Camera / IPC, 200 = Central SIP Platform)
 *   [11-17] Sequence Number (7 digits padded with 0s)
 *   [18-19] Sub-channel ID (01 = Main video channel)
 */
export const generateGb28181DeviceId = (
  sequenceNumber: number,
  areaCode: string = "340200",
  typeCode: string = "132"
): string => {
  const safeArea = areaCode.padEnd(6, "0").slice(0, 6);
  const dept = "00";
  const safeType = typeCode.padEnd(3, "0").slice(0, 3);
  const seq = (sequenceNumber % 10000000).toString().padStart(7, "0");
  const channel = "01";
  return `${safeArea}${dept}${safeType}${seq}${channel}`;
};

/**
 * Builds an 8-byte hexadecimal PTZ control string conforming to GB/T 28181 MANSCDP.
 * 
 * Byte breakdown:
 *   Byte 1: 0xA5 (Header)
 *   Byte 2: 0x0F (Combination / version code)
 *   Byte 3: 0x01 (Address / target)
 *   Byte 4: Command Code (0x01: right, 0x02: left, 0x08: up, 0x04: down, 0x10: zoom in, 0x20: zoom out, 0x00: stop)
 *   Byte 5: Pan Speed (0x00 - 0xFF)
 *   Byte 6: Tilt Speed (0x00 - 0xFF)
 *   Byte 7: Zoom Speed (high 4 bits zoom speed, low 4 bits 0)
 *   Byte 8: Checksum (sum of bytes 1..7 mod 256)
 */
export const buildPTZCmd = (
  direction: PTZDirection,
  speed: number = 32
): string => {
  const clampedSpeed = Math.min(Math.max(Math.round(speed), 1), 255);
  let cmdCode = 0x00;
  let panSpeed = 0x00;
  let tiltSpeed = 0x00;
  let zoomSpeed = 0x00;

  switch (direction) {
    case "right":
      cmdCode = 0x01;
      panSpeed = clampedSpeed;
      break;
    case "left":
      cmdCode = 0x02;
      panSpeed = clampedSpeed;
      break;
    case "down":
      cmdCode = 0x04;
      tiltSpeed = clampedSpeed;
      break;
    case "up":
      cmdCode = 0x08;
      tiltSpeed = clampedSpeed;
      break;
    case "upright":
      cmdCode = 0x09;
      panSpeed = clampedSpeed;
      tiltSpeed = clampedSpeed;
      break;
    case "upleft":
      cmdCode = 0x0A;
      panSpeed = clampedSpeed;
      tiltSpeed = clampedSpeed;
      break;
    case "downright":
      cmdCode = 0x05;
      panSpeed = clampedSpeed;
      tiltSpeed = clampedSpeed;
      break;
    case "downleft":
      cmdCode = 0x06;
      panSpeed = clampedSpeed;
      tiltSpeed = clampedSpeed;
      break;
    case "zoomin":
      cmdCode = 0x10;
      zoomSpeed = (clampedSpeed >> 4) & 0x0f;
      break;
    case "zoomout":
      cmdCode = 0x20;
      zoomSpeed = (clampedSpeed >> 4) & 0x0f;
      break;
    case "stop":
    default:
      cmdCode = 0x00;
      panSpeed = 0x00;
      tiltSpeed = 0x00;
      zoomSpeed = 0x00;
      break;
  }

  const bytes = [
    0xa5,
    0x0f,
    0x01,
    cmdCode,
    panSpeed,
    tiltSpeed,
    (zoomSpeed << 4) & 0xf0,
  ];

  const checksum = bytes.reduce((sum, b) => (sum + b) % 256, 0);
  bytes.push(checksum);

  return bytes
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");
};

/**
 * Builds MANSCDP DeviceControl XML for PTZ movement.
 */
export const buildDeviceControlXml = (
  sn: number,
  deviceId: string,
  ptzCmd: string
): string => {
  return (
    `<?xml version="1.0" encoding="GB2312"?>\r\n` +
    `<Control>\r\n` +
    `  <CmdType>DeviceControl</CmdType>\r\n` +
    `  <SN>${sn}</SN>\r\n` +
    `  <DeviceID>${deviceId}</DeviceID>\r\n` +
    `  <PTZCmd>${ptzCmd}</PTZCmd>\r\n` +
    `</Control>\r\n`
  );
};

/**
 * Builds MANSCDP Catalog Query XML.
 */
export const buildCatalogQueryXml = (sn: number, deviceId: string): string => {
  return (
    `<?xml version="1.0" encoding="GB2312"?>\r\n` +
    `<Query>\r\n` +
    `  <CmdType>Catalog</CmdType>\r\n` +
    `  <SN>${sn}</SN>\r\n` +
    `  <DeviceID>${deviceId}</DeviceID>\r\n` +
    `</Query>\r\n`
  );
};

/**
 * Builds MANSCDP RecordInfo Query XML for MicroSD card video searches.
 */
export const buildRecordInfoQueryXml = (
  sn: number,
  deviceId: string,
  startTime: Date,
  endTime: Date
): string => {
  const formatIso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "");
  return (
    `<?xml version="1.0" encoding="GB2312"?>\r\n` +
    `<Query>\r\n` +
    `  <CmdType>RecordInfo</CmdType>\r\n` +
    `  <SN>${sn}</SN>\r\n` +
    `  <DeviceID>${deviceId}</DeviceID>\r\n` +
    `  <StartTime>${formatIso(startTime)}</StartTime>\r\n` +
    `  <EndTime>${formatIso(endTime)}</EndTime>\r\n` +
    `  <Type>all</Type>\r\n` +
    `</Query>\r\n`
  );
};

/**
 * Fast zero-dependency XML tag extractor for SIP message bodies.
 */
export const extractXmlTag = (xml: string, tag: string): string | null => {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
};
