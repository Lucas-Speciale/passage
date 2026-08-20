export interface CorridorPoint {
  period: string;
  dailyAverage: number;
}

export interface Corridor {
  id: string;
  name: string;
  short: string;
  note: string;
  lon: number;
  lat: number;
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  series: CorridorPoint[];
}

export interface CorridorData {
  corridors: Corridor[];
}

export type PassageMode = "flow" | "change";
