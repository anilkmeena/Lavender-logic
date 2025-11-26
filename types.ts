export interface GuessResult {
  row: number;
  input: string;
  count: number; // Digits present
  position: number; // Correct position
}

export interface Player {
  id: string; // UUID
  room_id: string;
  name: string;
  avatar_idx: number;
  guesses: GuessResult[];
  joined_at: string;
}

export interface Room {
  id: string; // 6 digit code
  secret_code: string;
  name: string; // Mythology name
  created_at: string;
  winner_id: string | null;
}

export type GameMode = 'home' | 'single' | 'create' | 'join' | 'lobby' | 'multiplayer';

export const INDIAN_MYTHOLOGY_NAMES = [
  "Garuda Wings",
  "Nandi Strength",
  "Airavata Trunk",
  "Shesha Coil",
  "Indra Thunder",
  "Agni Flame",
  "Varuna Tide",
  "Vayu Breeze",
  "Surya Ray",
  "Chandra Glow"
];

// Clay textured colors/gradients for avatars
export const AVATAR_STYLES = [
  "bg-gradient-to-br from-red-300 to-red-500",
  "bg-gradient-to-br from-blue-300 to-blue-500",
  "bg-gradient-to-br from-green-300 to-green-500",
  "bg-gradient-to-br from-yellow-300 to-yellow-500",
  "bg-gradient-to-br from-purple-300 to-purple-500",
  "bg-gradient-to-br from-pink-300 to-pink-500",
  "bg-gradient-to-br from-indigo-300 to-indigo-500",
  "bg-gradient-to-br from-teal-300 to-teal-500",
];
