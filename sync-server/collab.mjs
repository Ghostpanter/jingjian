// 静笺多人协作：同步服务端内置的 WebSocket 房间 + OT 排序（与 flutter_app/lib/services/collab/ot.dart 一致）。
// 无第三方依赖；客户端通过 ws(s)://<服务器>/api/collab?token=<JINGJIAN_TOKEN> 连接。
import { createHash, randomBytes, randomInt } from "node:crypto";

export const COLLAB_PROTOCOL = 2;
const MAX_FRAME = 4 * 1024 * 1024;
const MAX_DOC = 4 * 1024 * 1024;
const OWNER_GRACE_MS = Number(process.env.JINGJIAN_COLLAB_GRACE_MS || 30000);

// ---------- OT ----------
const ins = (pos, text) => [0, pos, text];
const del = (pos, len) => [1, pos, len];

export function applyOps(text, ops) {
  let s = text;
  for (const o of ops) {
    if (o[0] === 0) {
      if (o[1] < 0 || o[1] > s.length) throw new Error("ins out of range");
      s = s.slice(0, o[1]) + o[2] + s.slice(o[1]);
    } else {
      if (o[1] < 0 || o[1] + o[2] > s.length) throw new Error("del out of range");
      s = s.slice(0, o[1]) + s.slice(o[1] + o[2]);
    }
  }
  return s;
}

const shift = (x, q, l) => (x <= q ? x : x >= q + l ? x - l : q);

function prim(a, b) {
  if (a[0] === 0 && b[0] === 0) {
    if (a[1] < b[1]) return [[a], [ins(b[1] + a[2].length, b[2])]];
    return [[ins(a[1] + b[2].length, a[2])], [b]];
  }
  if (a[0] === 0 && b[0] === 1) {
    if (a[1] <= b[1]) return [[a], [del(b[1] + a[2].length, b[2])]];
    if (a[1] >= b[1] + b[2]) return [[ins(a[1] - b[2], a[2])], [b]];
    const left = a[1] - b[1];
    const bb = [];
    if (left > 0) bb.push(del(b[1], left));
    if (b[2] - left > 0) bb.push(del(b[1] + a[2].length, b[2] - left));
    return [[ins(b[1], a[2])], bb];
  }
  if (a[0] === 1 && b[0] === 0) {
    if (b[1] <= a[1]) return [[del(a[1] + b[2].length, a[2])], [b]];
    if (b[1] >= a[1] + a[2]) return [[a], [ins(b[1] - a[2], b[2])]];
    const left = b[1] - a[1];
    const aa = [];
    if (left > 0) aa.push(del(a[1], left));
    if (a[2] - left > 0) aa.push(del(a[1] + b[2].length, a[2] - left));
    return [aa, [ins(a[1], b[2])]];
  }
  const as = shift(a[1], b[1], b[2]), ae = shift(a[1] + a[2], b[1], b[2]);
  const bs = shift(b[1], a[1], a[2]), be = shift(b[1] + b[2], a[1], a[2]);
  return [ae > as ? [del(as, ae - as)] : [], be > bs ? [del(bs, be - bs)] : []];
}

export function transform(a, b) {
  if (!a.length || !b.length) return [a, b];
  if (a.length === 1 && b.length === 1) return prim(a[0], b[0]);
  if (a.length > 1) {
    const [a0, b1] = transform([a[0]], b);
    const [rest, b2] = transform(a.slice(1), b1);
    return [[...a0, ...rest], b2];
  }
  const [a1, b0] = transform(a, [b[0]]);
  const [a2, rest] = transform(a1, b.slice(1));
  return [a2, [...b0, ...rest]];
}

function validOps(ops) {
  if (!Array.isArray(ops) || ops.length > 1000) return null;
  const out = [];
  for (const o of ops) {
    if (!Array.isArray(o) || !Number.isInteger(o[1])) return null;
    if (o[0] === 0 && typeof o[2] === "string") out.push(ins(o[1], o[2]));
    else if (o[0] === 1 && Number.isInteger(o[2]) && o[2] >= 0) out.push(del(o[1], o[2]));
    else return null;
  }
  return out;
}

export class OtServerDoc {
  constructor(text) {
    this.text = text;
    this.history = [];
  }
  get rev() {
    return this.history.length;
  }
  receive(baseRev, ops) {
    if (!Number.isInteger(baseRev) || baseRev < 0 || baseRev > this.rev) throw new Error("bad revision");
    let o = ops;
    for (let i = baseRev; i < this.history.length; i++) o = transform(o, this.history[i])[0];
    const next = applyOps(this.text, o);
    if (next.length > MAX_DOC) throw new Error("文档过大");
    this.text = next;
    this.history.push(o);
    return o;
  }
}

// ---------- minimal RFC 6455 ----------
class Socket {
  constructor(sock, onText, onClose) {
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.closed = false;
    this.onText = onText;
    this.onClose = onClose;
    sock.setNoDelay(true);
    sock.on("data", (d) => this.#data(d));
    sock.on("close", () => this.#gone());
    sock.on("error", () => this.#gone());
    this.alive = true;
    this.ping = setInterval(() => {
      if (!this.alive) return this.close(1001, "timeout");
      this.alive = false;
      this.#frame(0x9, Buffer.alloc(0));
    }, 20000);
  }
  #gone() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.ping);
    this.onClose();
  }
  #frame(op, payload) {
    if (this.closed) return;
    const len = payload.length;
    let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) {
      head = Buffer.alloc(4);
      head[0] = 0x80 | op;
      head[1] = 126;
      head.writeUInt16BE(len, 2);
    } else {
      head = Buffer.alloc(10);
      head[0] = 0x80 | op;
      head[1] = 127;
      head.writeBigUInt64BE(BigInt(len), 2);
    }
    try {
      this.sock.write(Buffer.concat([head, payload]));
    } catch {}
  }
  send(obj) {
    this.#frame(0x1, Buffer.from(JSON.stringify(obj), "utf8"));
  }
  close(code = 1000, reason = "") {
    if (this.closed) return;
    const p = Buffer.alloc(2 + Buffer.byteLength(reason));
    p.writeUInt16BE(code, 0);
    p.write(reason, 2);
    this.#frame(0x8, p);
    try {
      this.sock.end();
    } catch {}
    setTimeout(() => this.sock.destroy(), 1000).unref();
    this.#gone();
  }
  #data(d) {
    this.alive = true;
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_FRAME)) return this.close(1009, "too big");
        len = Number(big);
        off = 10;
      }
      if (!masked) return this.close(1002, "unmasked");
      if (len > MAX_FRAME) return this.close(1009, "too big");
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const payload = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      if (op === 0x8) return this.close(1000, "");
      if (op === 0x9) {
        this.#frame(0xa, payload);
        continue;
      }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x0) {
        this.frags.push(payload);
        const total = this.frags.reduce((n, f) => n + f.length, 0);
        if (total > MAX_FRAME) return this.close(1009, "too big");
        if (fin) {
          const text = Buffer.concat(this.frags).toString("utf8");
          this.frags = [];
          try {
            this.onText(text);
          } catch {}
        }
      }
    }
  }
}

// ---------- rooms ----------
const rooms = new Map(); // code -> room
let seq = 0;

function newCode() {
  for (let i = 0; i < 50; i++) {
    const c = String(randomInt(100000, 1000000));
    if (!rooms.has(c)) return c;
  }
  throw new Error("房间太多");
}

function cleanName(n) {
  const s = String(n || "").trim().slice(0, 24);
  return s || "访客";
}

function roster(room) {
  return [...room.peers.values()].map((p) => ({ id: p.id, name: p.name }));
}

function broadcast(room, msg, except) {
  for (const p of room.peers.values()) if (p !== except) p.ws.send(msg);
}

function welcome(room, peer) {
  peer.ws.send({
    t: "welcome",
    v: COLLAB_PROTOCOL,
    id: peer.id,
    code: room.code,
    rev: room.doc.rev,
    text: room.doc.text,
    title: room.title,
    owner: room.owner === peer,
    ...(room.owner === peer ? { ownerKey: room.ownerKey } : {}),
  });
}

/** Returns true when the request was handled as a collab upgrade. */
export function handleCollabUpgrade(req, socket, { authorized, maxRooms = 200 }) {
  const url = new URL(req.url || "/", "http://x");
  if (url.pathname !== "/api/collab") return false;
  const reject = (code, text) => {
    socket.end(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  };
  const key = req.headers["sec-websocket-key"];
  if (String(req.headers.upgrade || "").toLowerCase() !== "websocket" || !key) {
    reject(400, "Bad Request");
    return true;
  }
  const token = url.searchParams.get("token") || "";
  if (!authorized(req, token)) {
    reject(401, "Unauthorized");
    return true;
  }
  const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  const peer = { id: `p${++seq}`, name: "", room: null, ws: null };
  const leave = () => {
    const room = peer.room;
    if (!room) return;
    peer.room = null;
    room.peers.delete(peer.id);
    if (room.owner === peer && !peer.ended) {
      // 发起人掉线：保留房间一会儿，等他重连。
      room.owner = null;
      broadcast(room, { t: "peers", peers: roster(room) });
      room.grace = setTimeout(() => closeRoom(room), OWNER_GRACE_MS);
      room.grace.unref?.();
      return;
    }
    if (room.owner === peer) {
      closeRoom(room);
    } else {
      broadcast(room, { t: "peers", peers: roster(room) });
    }
  };
  const closeRoom = (room) => {
    clearTimeout(room.grace);
    if (rooms.get(room.code) !== room) return;
    {
      // 发起人结束：房间关闭。
      for (const p of room.peers.values()) {
        p.ws.send({ t: "error", msg: "发起人已结束协作" });
        p.room = null;
        p.ws.close(4000, "room closed");
      }
      room.peers.clear();
      rooms.delete(room.code);
    }
  };
  const hello = setTimeout(() => {
    if (!peer.room) peer.ws.close(4001, "hello timeout");
  }, 10000);
  peer.ws = new Socket(
    socket,
    (raw) => {
      let m;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      if (!m || typeof m !== "object") return;
      if (!peer.room) {
        if (m.t === "create") {
          if (rooms.size >= maxRooms) {
            peer.ws.send({ t: "error", msg: "服务器上的协作房间已满" });
            return peer.ws.close(4004, "full");
          }
          const text = typeof m.text === "string" ? m.text : "";
          if (text.length > MAX_DOC) {
            peer.ws.send({ t: "error", msg: "文档过大" });
            return peer.ws.close(4005, "too big");
          }
          const room = {
            code: newCode(),
            title: String(m.title || "").slice(0, 200),
            doc: new OtServerDoc(text),
            peers: new Map(),
            owner: peer,
            ownerKey: randomBytes(16).toString("hex"),
            grace: null,
          };
          rooms.set(room.code, room);
          peer.name = cleanName(m.name);
          peer.room = room;
          room.peers.set(peer.id, peer);
          clearTimeout(hello);
          welcome(room, peer);
          broadcast(room, { t: "peers", peers: roster(room) });
        } else if (m.t === "hello") {
          const room = rooms.get(String(m.code || "").trim());
          if (!room) {
            peer.ws.send({ t: "error", msg: "房间不存在或已结束" });
            return peer.ws.close(4003, "bad code");
          }
          peer.name = cleanName(m.name);
          peer.room = room;
          room.peers.set(peer.id, peer);
          if (typeof m.ownerKey === "string" && m.ownerKey === room.ownerKey) {
            // 发起人重连成功（旧连接可能还没被发现断开）
            room.owner = peer;
            clearTimeout(room.grace);
            room.grace = null;
          }
          clearTimeout(hello);
          welcome(room, peer);
          broadcast(room, { t: "peers", peers: roster(room) });
        }
        return;
      }
      const room = peer.room;
      if (m.t === "hello") return welcome(room, peer); // 客户端请求重同步
      if (m.t === "end") {
        // 发起人主动结束协作：立即关房间。
        if (room.owner === peer) {
          peer.ended = true;
          return closeRoom(room);
        }
        return;
      }
      if (m.t === "op") {
        const ops = validOps(m.ops);
        let applied;
        try {
          if (!ops) throw new Error("bad ops");
          applied = room.doc.receive(m.rev, ops);
        } catch {
          return welcome(room, peer);
        }
        peer.ws.send({ t: "ack", rev: room.doc.rev });
        broadcast(room, { t: "op", rev: room.doc.rev, ops: applied, from: peer.id }, peer);
      } else if (m.t === "cursor" && Number.isInteger(m.pos)) {
        broadcast(room, { t: "cursor", from: peer.id, pos: m.pos }, peer);
      }
    },
    () => {
      clearTimeout(hello);
      leave();
    },
  );
  return true;
}

export const _rooms = rooms;
