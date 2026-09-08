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
  series: CorridorPoint[];
}

export interface CorridorData {
  corridors: Corridor[];
}

export type PassageMode = "flow" | "change";
