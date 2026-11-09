import { Schema, MapSchema, defineTypes } from "@colyseus/schema";

export class Player extends Schema {
  name = "";
  cls = "";
  level = 1;
  x = 0;
  z = 0;
  dead = false;
  inst = 0;        // 0 = mundo aberto; >0 = instância de dungeon
  ap = "";         // aparência (equipamento) — os outros jogadores veem pelos itens
}
defineTypes(Player, { name: "string", cls: "string", level: "number", x: "number", z: "number", dead: "boolean", inst: "uint16", ap: "string" });

// Monstro simulado no servidor: todos os jogadores veem o mesmo monstro, na mesma posição e com a mesma vida.
export class Monster extends Schema {
  id = 0;
  type = "";
  lvl = 1;
  hp = 1;
  maxHp = 1;
  x = 0;
  z = 0;
  rot = 0;
  alive = true;
  inst = 0;
  st = 0;          // estados: 1 atordoado • 2 imobilizado • 4 levantado
}
defineTypes(Monster, {
  id: "uint32", type: "string", lvl: "uint8", hp: "float32", maxHp: "float32",
  x: "float32", z: "float32", rot: "float32", alive: "boolean", inst: "uint16", st: "uint8"
});

export class WorldState extends Schema {
  players = new MapSchema<Player>();
  monsters = new MapSchema<Monster>();
}
defineTypes(WorldState, { players: { map: Player }, monsters: { map: Monster } });
