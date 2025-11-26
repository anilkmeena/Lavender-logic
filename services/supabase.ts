import { createClient } from '@supabase/supabase-js';
import { Player, Room, GuessResult, INDIAN_MYTHOLOGY_NAMES } from '../types';

// --- CONFIGURATION START ---
// Configured based on your project ID: xvpvsaovshendeszifnq
const SUPABASE_URL = "https://xvpvsaovshendeszifnq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2cHZzYW92c2hlbmRlc3ppZm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzgzMTcsImV4cCI6MjA3OTc1NDMxN30.Y8TtfIB_6jmWfmE1agcKyQFjkFlBl10JTzTTHMiSqnQ";
// --- CONFIGURATION END ---

export const supabase = (SUPABASE_URL && SUPABASE_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_KEY) 
  : null;

/**
 * Game Logic Helpers
 */
export const generateSecretCode = (): string => {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  let code = '';
  for (let i = 0; i < 4; i++) {
    const randomIndex = Math.floor(Math.random() * digits.length);
    code += digits[randomIndex];
    digits.splice(randomIndex, 1);
  }
  return code;
};

export const calculateGuess = (input: string, secret: string, rowNum: number): GuessResult => {
  let count = 0; // "Cows" + "Bulls" (Total matches)
  let position = 0; // "Bulls" (Exact matches)

  const inputArr = input.split('');
  const secretArr = secret.split('');

  // Calculate Position (Exact matches)
  for (let i = 0; i < 4; i++) {
    if (inputArr[i] === secretArr[i]) {
      position++;
    }
  }

  // Calculate Count (Intersection of digits)
  const inputSet = new Set(inputArr);
  const secretSet = new Set(secretArr);
  const intersection = new Set([...inputSet].filter(x => secretSet.has(x)));
  count = intersection.size;

  return { row: rowNum, input, count, position };
};

export const validateInput = (input: string): string | null => {
  if (input.length !== 4) return "Number must be 4 digits.";
  if (!/^[1-9]+$/.test(input)) return "Digits must be 1-9 (no zeroes).";
  const uniqueChars = new Set(input.split(''));
  if (uniqueChars.size !== 4) return "Digits cannot be repeated.";
  return null;
};

/**
 * API Methods
 */

export const createRoom = async (playerName: string): Promise<{ room: Room, player: Player } | null> => {
  if (!supabase) throw new Error("Supabase credentials missing or invalid.");

  const roomId = Math.floor(100000 + Math.random() * 900000).toString();
  const roomName = INDIAN_MYTHOLOGY_NAMES[Math.floor(Math.random() * INDIAN_MYTHOLOGY_NAMES.length)];
  const secretCode = generateSecretCode();

  const { data: roomData, error: roomError } = await supabase
    .from('rooms')
    .insert([{ id: roomId, name: roomName, secret_code: secretCode }])
    .select()
    .single();

  if (roomError) throw roomError;

  const { data: playerData, error: playerError } = await supabase
    .from('players')
    .insert([{
      room_id: roomId,
      name: playerName,
      avatar_idx: Math.floor(Math.random() * 8),
    }])
    .select()
    .single();

  if (playerError) throw playerError;

  return { room: roomData, player: playerData };
};

export const joinRoom = async (roomId: string, playerName: string): Promise<{ room: Room, player: Player } | null> => {
  if (!supabase) throw new Error("Supabase credentials missing or invalid.");

  const { data: roomData, error: roomError } = await supabase
    .from('rooms')
    .select()
    .eq('id', roomId)
    .single();

  if (roomError || !roomData) throw new Error("Room not found");

  const { data: playerData, error: playerError } = await supabase
    .from('players')
    .insert([{
      room_id: roomId,
      name: playerName,
      avatar_idx: Math.floor(Math.random() * 8),
    }])
    .select()
    .single();

  if (playerError) throw playerError;

  return { room: roomData, player: playerData };
};

export const submitMultiplayerGuess = async (
  player: Player, 
  newGuess: GuessResult,
  isWin: boolean,
  roomId: string
) => {
  if (!supabase) return;

  const updatedGuesses = [...player.guesses, newGuess];
  
  // Update player guesses
  await supabase
    .from('players')
    .update({ guesses: updatedGuesses })
    .eq('id', player.id);
  
  // Check win condition
  if (isWin) {
    await supabase
      .from('rooms')
      .update({ winner_id: player.id })
      .eq('id', roomId);
  }
};

export const leaveRoom = async (playerId: string) => {
  if (!supabase) return;
  await supabase.from('players').delete().eq('id', playerId);
};