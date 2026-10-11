'use strict';
const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');
const PORT = Number(process.env.PORT || 8080);
const MAX_PLAYERS_PER_ROOM = 40;
const WORLD = 4200;
const ROOMS = {
  classica: { nome: 'Clássica', crescimento: 1, perda: 1, velocidade: 1 },
  turbo:    { nome: 'Crescimento Rápido', crescimento: 2, perda: 2, velocidade: 1.12 },
  caos:     { nome: 'Modo Caos', crescimento: 3, perda: 3.5, velocidade: 1.28 }
};
const COLORS = ['#4FB3F5','#FF6B8A','#8BD34E','#FFC93C','#A77BFF','#38D9C4','#FF8A3D','#F45B69','#5AD1FF','#C6E24B'];
const rooms = new Map();
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end('PetVora Online server is running. WebSocket endpoint active.');
});
const wss = new WebSocket.Server({ server, maxPayload: 16 * 1024 });
function getRoom(id) { if (!rooms.has(id)) rooms.set(id, new Map()); return rooms.get(id); }
function safeName(v) { return String(v || 'Jogador').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 18) || 'Jogador'; }
function send(ws, data) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function snapshot(roomId) {
  const room = getRoom(roomId);
  return Array.from(room.values()).map(p => ({ id:p.id, name:p.name, color:p.color, skin:p.skin, alive:p.alive,
    cells:p.cells.map(c => ({ x:c.x, y:c.y, r:c.r })) }));
}
function broadcast(roomId) {
  const room = getRoom(roomId); const players = snapshot(roomId);
  for (const p of room.values()) send(p.ws, { type:'state', players, count:room.size, room:roomId });
}
wss.on('connection', ws => {
  ws.id = crypto.randomUUID(); ws.roomId = null; ws.player = null;
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'join') {
      if (ws.roomId) return;
      const roomId = Object.prototype.hasOwnProperty.call(ROOMS, msg.room) ? msg.room : 'classica';
      const room = getRoom(roomId);
      if (room.size >= MAX_PLAYERS_PER_ROOM) { send(ws, { type:'error', message:'Esta sala está cheia. Escolha outra sala.' }); return; }
      const p = { id:ws.id, ws, roomId, name:safeName(msg.name), color:COLORS[Math.floor(Math.random()*COLORS.length)],
        skin:String(msg.skin || 'classico').slice(0,30), alive:true,
        cells:[{ x:Math.floor(600+Math.random()*(WORLD-1200)), y:Math.floor(600+Math.random()*(WORLD-1200)), r:26 }], lastUpdate:Date.now() };
      room.set(p.id,p); ws.roomId=roomId; ws.player=p;
      send(ws, { type:'joined', id:p.id, room:roomId, rules:ROOMS[roomId], count:room.size, maxPlayers:MAX_PLAYERS_PER_ROOM });
      broadcast(roomId); return;
    }
    if (msg.type === 'update' && ws.roomId && ws.player) {
      const p = ws.player;
      p.name = safeName(msg.name); p.skin = String(msg.skin || 'classico').slice(0,30);
      p.alive = msg.alive !== false;
      if (Array.isArray(msg.cells)) {
        p.cells = msg.cells.slice(0,8).map(c => ({
          x: clampNum(c.x, 0, WORLD, WORLD/2), y: clampNum(c.y, 0, WORLD, WORLD/2), r: clampNum(c.r, 16, 320, 26)
        }));
      }
      if (!p.cells.length) p.cells = [{ x:WORLD/2, y:WORLD/2, r:26 }];
      p.lastUpdate = Date.now();
    }
  });
  ws.on('close', () => { if (ws.roomId && ws.player) { const id=ws.roomId; getRoom(id).delete(ws.id); broadcast(id); } });
  ws.on('error', () => {});
});
function clampNum(v, min, max, fallback) { const n=Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max,n)) : fallback; }
setInterval(() => {
  for (const [roomId, room] of rooms) {
    const now=Date.now();
    for (const [id,p] of room) {
      if (p.ws.readyState !== WebSocket.OPEN || now-p.lastUpdate > 30000) { room.delete(id); try { p.ws.close(); } catch {} }
    }
    if (room.size) broadcast(roomId);
  }
}, 100);
server.listen(PORT, '0.0.0.0', () => console.log(`PetVora Online rodando na porta ${PORT}`));
