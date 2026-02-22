export interface SessionStylePreferences {
  preferredStyle?: string;
  colorPreferences?: string[];
  materialPreferences?: string[];
  inspiration?: string;
}

export interface RoomSummary {
  id: string;
  name: string;
  type: string;
  budget: string | null;
}
