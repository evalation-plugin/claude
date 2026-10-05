"use strict";

const { deflateRawSync, inflateRawSync } = require("node:zlib");
const { raised } = require("./errors.js");

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

const TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function checksum(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) c = TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function endOf(buffer) {
  for (let at = buffer.length - 22; at >= 0; at -= 1) {
    if (buffer.readUInt32LE(at) === END) return at;
  }
  throw raised("not a zip: no end record", null);
}

function read(buffer) {
  const end = endOf(buffer);
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);

  const entries = [];
  for (let n = 0; n < count; n += 1) {
    if (buffer.readUInt32LE(at) !== CENTRAL) throw raised("not a zip: bad directory", null);
    const method = buffer.readUInt16LE(at + 10);
    const compressed = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const from = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);

    if (buffer.readUInt32LE(from) !== LOCAL) throw raised(`not a zip: bad entry ${name}`, null);
    const dataAt = from + 30 + buffer.readUInt16LE(from + 26) + buffer.readUInt16LE(from + 28);
    const raw = buffer.subarray(dataAt, dataAt + compressed);

    entries.push({ name, content: method === 0 ? Buffer.from(raw) : inflateRawSync(raw) });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function write(entries) {
  const locals = [];
  const centrals = [];
  let at = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const packed = deflateRawSync(entry.content, { level: 9 });
    const crc = checksum(entry.content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(at, 42);
    centrals.push(central, name);

    at += 30 + name.length + packed.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(at, 16);

  return Buffer.concat([...locals, directory, end]);
}

module.exports = { read, write };
