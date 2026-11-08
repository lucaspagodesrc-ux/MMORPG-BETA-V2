import { Schema, MapSchema, defineTypes } from "@colyseus/schema";

export class Player extends Schema {
  name = "";
  cls = "";
  level = 1;
  x = 0;
  z = 0;
}
defineTypes(Player, { name: "string", cls: "string", level: "number", x: "number", z: "number" });

export class WorldState extends Schema {
  players = new MapSchema<Player>();
}
defineTypes(WorldState, { players: { map: Player } });
