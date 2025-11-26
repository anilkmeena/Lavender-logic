import React, { useState, useEffect, useRef } from 'react';
import { 
  User, Users, PlusSquare, ArrowLeft, Copy, 
  Send, RotateCcw, Home, Eye, X, Crown, AlertTriangle
} from 'lucide-react';
import { 
  GameMode, Player, Room, GuessResult, AVATAR_STYLES 
} from './types';
import * as GameService from './services/supabase';

export default function App() {
  // Application State
  const [mode, setMode] = useState<GameMode>('home');
  const [error, setError] = useState<string | null>(null);
  
  // Single Player State
  const [singleSecret, setSingleSecret] = useState<string>('');
  const [singleGuesses, setSingleGuesses] = useState<GuessResult[]>([]);
  const [singleWon, setSingleWon] = useState(false);

  // Multiplayer State
  const [room, setRoom] = useState<Room | null>(null);
  const [me, setMe] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [spectatingId, setSpectatingId] = useState<string | null>(null);
  const [showPlayerList, setShowPlayerList] = useState(false);

  // Form Inputs
  const [inputCode, setInputCode] = useState('');
  const [userName, setUserName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');

  // Supabase Realtime Subscription
  useEffect(() => {
    if (mode !== 'multiplayer' || !room || !GameService.supabase) return;

    // Fetch initial players
    GameService.supabase
      .from('players')
      .select('*')
      .eq('room_id', room.id)
      .order('joined_at', { ascending: true })
      .then(({ data }) => {
        if (data) setPlayers(data as Player[]);
      });

    // Subscribe to changes
    const channel = GameService.supabase.channel(`room:${room.id}`)
      .on(
        'postgres_changes', 
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPlayers(prev => [...prev, payload.new as Player].sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()));
          } else if (payload.eventType === 'UPDATE') {
             setPlayers(prev => prev.map(p => p.id === payload.new.id ? (payload.new as Player) : p));
             // Update self if needed
             if (payload.new.id === me?.id) setMe(payload.new as Player);
          } else if (payload.eventType === 'DELETE') {
            setPlayers(prev => prev.filter(p => p.id !== payload.old.id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        (payload) => {
          setRoom(payload.new as Room);
        }
      )
      .subscribe();

    return () => {
      GameService.supabase?.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, room?.id]);


  // --- Logic Helpers ---

  const handleCreateRoom = async () => {
    if (!userName.trim()) return setError("Please enter your name.");
    try {
      const result = await GameService.createRoom(userName);
      if (result) {
        setRoom(result.room);
        setMe(result.player);
        setMode('multiplayer');
      }
    } catch (e: any) {
      setError("Failed to create room. Check Supabase config.");
      console.error(e);
    }
  };

  const handleJoinRoom = async () => {
    if (!userName.trim()) return setError("Please enter your name.");
    if (roomCodeInput.length !== 6) return setError("Invalid Room ID.");
    try {
      const result = await GameService.joinRoom(roomCodeInput, userName);
      if (result) {
        setRoom(result.room);
        setMe(result.player);
        setMode('multiplayer');
      }
    } catch (e: any) {
      setError("Could not join room. It might not exist.");
    }
  };

  const handleGuessSubmit = async () => {
    setError(null);
    const validationError = GameService.validateInput(inputCode);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (mode === 'single') {
      const result = GameService.calculateGuess(inputCode, singleSecret, singleGuesses.length + 1);
      const newGuesses = [...singleGuesses, result];
      setSingleGuesses(newGuesses);
      if (result.count === 4 && result.position === 4) {
        setSingleWon(true);
      }
      setInputCode('');
    } 
    else if (mode === 'multiplayer' && room && me) {
      if (!isMyTurn) {
        setError("It's not your turn!");
        return;
      }
      const result = GameService.calculateGuess(inputCode, room.secret_code, me.guesses.length + 1);
      const isWin = result.count === 4 && result.position === 4;
      
      // Optimistic update
      const updatedMe = { ...me, guesses: [...me.guesses, result] };
      setMe(updatedMe);
      setPlayers(prev => prev.map(p => p.id === me.id ? updatedMe : p));
      setInputCode('');

      await GameService.submitMultiplayerGuess(me, result, isWin, room.id);
    }
  };

  const startSinglePlayer = () => {
    setSingleSecret(GameService.generateSecretCode());
    setSingleGuesses([]);
    setSingleWon(false);
    setInputCode('');
    setMode('single');
  };

  const leaveMultiplayer = () => {
    if (me) GameService.leaveRoom(me.id);
    setMode('home');
    setRoom(null);
    setMe(null);
    setPlayers([]);
  };

  // --- Derived State for Multiplayer ---
  
  const sortedPlayers = [...players]; // Already sorted by joined_at from DB query usually, but Supabase Realtime keeps order reasonably well.
  // Logic to determine turn: Total guesses across all players?
  // Actually, turn is circular. Player 0 -> Player 1 -> ...
  // However, players join at different times. 
  // Let's assume turn is based on: (Total Guesses Made by Everyone) % PlayerCount
  // But if players miss turns or drop, this is tricky.
  // Robust simple way: Find player with fewest guesses. If tie, determine by index in list.
  
  // Alternative robust turn logic:
  // Turn index = (SUM of all guesses count) % players.length
  const totalGuessesInRoom = players.reduce((acc, p) => acc + (p.guesses?.length || 0), 0);
  const currentTurnIndex = players.length > 0 ? totalGuessesInRoom % players.length : 0;
  const currentTurnPlayer = players[currentTurnIndex];
  const isMyTurn = mode === 'multiplayer' && !room?.winner_id && currentTurnPlayer?.id === me?.id;

  const spectatingPlayer = spectatingId ? players.find(p => p.id === spectatingId) : null;
  const displayPlayer = spectatingPlayer || me;
  const winner = room?.winner_id ? players.find(p => p.id === room.winner_id) : null;

  // --- UI Components ---

  const Keypad = () => (
    <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto mt-6">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
        <button
          key={num}
          onClick={() => {
             if (inputCode.length < 4 && !inputCode.includes(num.toString())) {
               setInputCode(prev => prev + num);
               setError(null);
             }
          }}
          disabled={inputCode.includes(num.toString()) || inputCode.length >= 4 || !!winner || singleWon}
          className="aspect-square rounded-2xl bg-white shadow-clay-btn active:shadow-clay-btn-active active:scale-95 transition-all text-xl font-bold text-lavender-800 disabled:opacity-50 disabled:shadow-none"
        >
          {num}
        </button>
      ))}
      <button 
        onClick={() => setInputCode(prev => prev.slice(0, -1))}
        className="aspect-square flex items-center justify-center rounded-2xl bg-red-50 text-red-500 shadow-clay-btn active:shadow-clay-btn-active active:scale-95 transition-all"
      >
        <RotateCcw size={24} />
      </button>
      <div className="flex items-center justify-center text-2xl font-mono tracking-widest text-lavender-900">
        {inputCode.padEnd(4, '_')}
      </div>
      <button 
        onClick={handleGuessSubmit}
        disabled={inputCode.length !== 4 || !!winner || singleWon}
        className={`aspect-square flex items-center justify-center rounded-2xl shadow-clay-btn transition-all ${inputCode.length === 4 ? 'bg-lavender-600 text-white active:shadow-clay-btn-active active:scale-95' : 'bg-gray-100 text-gray-400'}`}
      >
        <Send size={24} />
      </button>
    </div>
  );

  const GuessHistory = ({ guesses }: { guesses: GuessResult[] }) => (
    <div className="flex-1 overflow-y-auto w-full max-w-md mx-auto px-4 mt-4 mb-4 scrollbar-hide">
      <div className="sticky top-0 bg-lavender-100 z-10 pb-2">
        <div className="grid grid-cols-4 gap-2 text-xs uppercase tracking-wider text-lavender-500 font-semibold text-center mb-2">
          <div>#</div>
          <div>Input</div>
          <div>Count</div>
          <div>Pos</div>
        </div>
      </div>
      <div className="space-y-2 pb-20">
        {guesses.map((g, idx) => (
          <div key={idx} className="grid grid-cols-4 gap-2 bg-white rounded-xl p-3 shadow-sm items-center text-center animate-[fadeIn_0.3s_ease-out]">
            <div className="text-gray-400 font-mono text-sm">{g.row}</div>
            <div className="font-mono text-lg font-bold text-lavender-900 tracking-widest">{g.input}</div>
            <div className="flex items-center justify-center">
               <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                 {g.count}
               </span>
            </div>
            <div className="flex items-center justify-center">
               <span className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-sm">
                 {g.position}
               </span>
            </div>
          </div>
        ))}
        {guesses.length === 0 && (
          <div className="text-center text-lavender-400 mt-10 italic">
            Start guessing the 4 digit number...
          </div>
        )}
      </div>
    </div>
  );

  // --- Views ---

  if (mode === 'home') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 space-y-8 bg-lavender-100">
        <div className="text-center space-y-2">
          <div className="inline-block p-4 rounded-3xl bg-lavender-200 shadow-clay-card mb-4">
             <span className="text-4xl">🔮</span>
          </div>
          <h1 className="text-4xl font-black text-lavender-900 tracking-tight">Lavender Logic</h1>
          <p className="text-lavender-600">Master the digits, rule the room.</p>
        </div>

        <div className="w-full max-w-xs space-y-6">
          <button 
            onClick={startSinglePlayer}
            className="w-full bg-white p-6 rounded-3xl shadow-clay-card active:scale-95 transition-transform flex items-center space-x-4 group"
          >
            <div className="p-3 bg-lavender-50 rounded-2xl group-hover:bg-lavender-100 transition-colors text-lavender-600">
              <User size={32} />
            </div>
            <div className="text-left">
              <h3 className="text-xl font-bold text-gray-800">Single Player</h3>
              <p className="text-sm text-gray-500">Practice your skills</p>
            </div>
          </button>

          <button 
            onClick={() => { setMode('create'); setUserName(''); }}
            className="w-full bg-white p-6 rounded-3xl shadow-clay-card active:scale-95 transition-transform flex items-center space-x-4 group"
          >
            <div className="p-3 bg-lavender-50 rounded-2xl group-hover:bg-lavender-100 transition-colors text-lavender-600">
              <PlusSquare size={32} />
            </div>
            <div className="text-left">
              <h3 className="text-xl font-bold text-gray-800">Create Room</h3>
              <p className="text-sm text-gray-500">Host a game for friends</p>
            </div>
          </button>

          <button 
            onClick={() => { setMode('join'); setUserName(''); setRoomCodeInput(''); }}
            className="w-full bg-white p-6 rounded-3xl shadow-clay-card active:scale-95 transition-transform flex items-center space-x-4 group"
          >
            <div className="p-3 bg-lavender-50 rounded-2xl group-hover:bg-lavender-100 transition-colors text-lavender-600">
              <Users size={32} />
            </div>
            <div className="text-left">
              <h3 className="text-xl font-bold text-gray-800">Join Room</h3>
              <p className="text-sm text-gray-500">Enter a room ID</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="min-h-screen flex flex-col p-6 bg-lavender-100">
        <button onClick={() => setMode('home')} className="self-start p-2 text-lavender-700 mb-8"><ArrowLeft /></button>
        <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full space-y-6">
           <h2 className="text-2xl font-bold text-lavender-900">Create a Room</h2>
           
           <div className="w-full bg-white p-6 rounded-3xl shadow-clay-card space-y-4">
             <label className="block text-sm font-semibold text-gray-600">Your Name</label>
             <input 
               value={userName}
               onChange={(e) => setUserName(e.target.value.slice(0, 20))}
               placeholder="Enter display name"
               className="w-full p-4 bg-lavender-50 rounded-xl outline-none focus:ring-2 focus:ring-lavender-400 text-lavender-900"
             />
             <div className="pt-2">
                <button 
                   onClick={handleCreateRoom}
                   className="w-full py-4 rounded-xl bg-lavender-600 text-white font-bold shadow-lg shadow-lavender-300 active:scale-95 transition-all"
                >
                  Create & Enter
                </button>
             </div>
           </div>
           
           {error && (
             <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm flex items-center gap-2">
               <AlertTriangle size={16}/> {error}
             </div>
           )}
           
           {!GameService.supabase && (
             <div className="text-xs text-center text-gray-400 mt-4">
               Backend not configured. Multiplayer will fail.
             </div>
           )}
        </div>
      </div>
    );
  }

  if (mode === 'join') {
    return (
      <div className="min-h-screen flex flex-col p-6 bg-lavender-100">
        <button onClick={() => setMode('home')} className="self-start p-2 text-lavender-700 mb-8"><ArrowLeft /></button>
        <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full space-y-6">
           <h2 className="text-2xl font-bold text-lavender-900">Join a Room</h2>
           
           <div className="w-full bg-white p-6 rounded-3xl shadow-clay-card space-y-4">
             <div>
               <label className="block text-sm font-semibold text-gray-600 mb-1">Room ID</label>
               <input 
                 value={roomCodeInput}
                 onChange={(e) => setRoomCodeInput(e.target.value.replace(/\D/g,'').slice(0, 6))}
                 placeholder="6-digit code"
                 type="tel"
                 className="w-full p-4 bg-lavender-50 rounded-xl outline-none focus:ring-2 focus:ring-lavender-400 text-lavender-900 font-mono tracking-widest text-center text-lg"
               />
             </div>
             <div>
               <label className="block text-sm font-semibold text-gray-600 mb-1">Your Name</label>
               <input 
                 value={userName}
                 onChange={(e) => setUserName(e.target.value.slice(0, 20))}
                 placeholder="Enter display name"
                 className="w-full p-4 bg-lavender-50 rounded-xl outline-none focus:ring-2 focus:ring-lavender-400 text-lavender-900"
               />
             </div>
             
             <div className="pt-2">
                <button 
                   onClick={handleJoinRoom}
                   className="w-full py-4 rounded-xl bg-lavender-600 text-white font-bold shadow-lg shadow-lavender-300 active:scale-95 transition-all"
                >
                  Enter Room
                </button>
             </div>
           </div>
           
           {error && (
             <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm flex items-center gap-2">
               <AlertTriangle size={16}/> {error}
             </div>
           )}
        </div>
      </div>
    );
  }

  if (mode === 'single') {
    return (
      <div className="min-h-screen flex flex-col bg-lavender-100 overflow-hidden relative">
        <div className="p-4 flex items-center justify-between">
           <button onClick={() => setMode('home')} className="p-2 bg-white rounded-full shadow-sm text-lavender-800">
             <Home size={20} />
           </button>
           <h2 className="font-bold text-lavender-900">Single Player</h2>
           <div className="w-10"></div>
        </div>

        <div className="text-center mt-2 mb-4">
           {singleWon ? (
             <div className="animate-bounce">
               <span className="text-4xl">🎉</span>
               <p className="font-bold text-lavender-700 mt-2">Code Cracked!</p>
             </div>
           ) : (
             <p className="text-lavender-500 text-sm">Guess the 4-digit number</p>
           )}
        </div>

        {error && (
           <div className="mx-4 p-3 bg-red-100 text-red-600 rounded-lg text-sm text-center mb-2 animate-pulse">
             {error}
           </div>
        )}

        <GuessHistory guesses={singleGuesses} />

        <div className="bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] p-6 pb-10">
           {singleWon ? (
             <button 
               onClick={startSinglePlayer}
               className="w-full py-4 bg-lavender-600 text-white rounded-2xl font-bold shadow-lg shadow-lavender-300 active:scale-95 transition-transform"
             >
               Play Again
             </button>
           ) : (
             <Keypad />
           )}
        </div>
      </div>
    );
  }

  if (mode === 'multiplayer' && room && me) {
    return (
      <div className="min-h-screen flex flex-col bg-lavender-100 overflow-hidden relative">
        {/* Header */}
        <div className="p-4 flex items-center justify-between z-20 relative">
           <button onClick={leaveMultiplayer} className="p-2 bg-white rounded-full shadow-sm text-lavender-800">
             <Home size={20} />
           </button>
           
           <div className="text-center">
             {spectatingPlayer ? (
               <div className="flex flex-col items-center animate-fadeIn">
                 <span className="text-xs font-bold text-lavender-400 uppercase tracking-wider">Watching</span>
                 <span className="font-bold text-lavender-900">{spectatingPlayer.name}</span>
               </div>
             ) : (
               <div className="flex flex-col items-center">
                  <span className="text-xs font-bold text-lavender-400 uppercase tracking-wider">
                     {room.name}
                  </span>
                  <div className="flex items-center gap-2 bg-white/50 px-3 py-1 rounded-full mt-1 border border-lavender-200">
                    <span className="font-mono font-bold text-lavender-800">{room.id}</span>
                    <button onClick={() => navigator.clipboard.writeText(room.id)} className="text-lavender-500 hover:text-lavender-700">
                      <Copy size={12} />
                    </button>
                  </div>
               </div>
             )}
           </div>

           <button 
             onClick={() => setShowPlayerList(true)}
             className="relative p-2 bg-white rounded-full shadow-sm text-lavender-800"
           >
             <Users size={20} />
             <span className="absolute -top-1 -right-1 w-5 h-5 bg-lavender-600 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-lavender-100">
               {players.length}
             </span>
           </button>
        </div>

        {/* Turn Indicator */}
        {!spectatingPlayer && !winner && (
          <div className="bg-lavender-200 py-2 text-center text-sm font-medium text-lavender-800 flex items-center justify-center gap-2">
            {isMyTurn ? (
              <span className="flex items-center gap-2 animate-pulse">It's your turn! <span className="w-2 h-2 rounded-full bg-green-500"></span></span>
            ) : (
              <span className="opacity-70">Waiting for {currentTurnPlayer?.name}...</span>
            )}
          </div>
        )}

        {/* Winner Banner */}
        {winner && (
           <div className="bg-yellow-100 p-4 m-4 rounded-2xl flex flex-col items-center justify-center shadow-sm text-center border-2 border-yellow-200 animate-bounce">
              <Crown className="text-yellow-600 mb-2" size={32} />
              <h3 className="font-bold text-yellow-800 text-lg">{winner.name} won!</h3>
              <p className="text-yellow-700 text-sm">The code was <span className="font-mono font-bold">{room.secret_code}</span></p>
           </div>
        )}

        {/* Error Message */}
        {error && (
           <div className="mx-4 p-3 bg-red-100 text-red-600 rounded-lg text-sm text-center mb-2 animate-pulse">
             {error}
           </div>
        )}

        {/* Gameplay Area */}
        <GuessHistory guesses={displayPlayer?.guesses || []} />

        {/* Input Area (Only if not spectating and not won) */}
        {!spectatingPlayer && !winner && (
          <div className={`bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] p-6 pb-10 transition-transform duration-300 ${!isMyTurn ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
             <Keypad />
          </div>
        )}

        {/* Spectator Back Button */}
        {spectatingPlayer && (
          <div className="absolute bottom-10 left-0 right-0 flex justify-center z-20">
             <button 
               onClick={() => setSpectatingId(null)}
               className="bg-lavender-800 text-white px-6 py-3 rounded-full shadow-lg font-bold flex items-center gap-2 active:scale-95 transition-transform"
             >
               <ArrowLeft size={16} /> Back to Game
             </button>
          </div>
        )}

        {/* Player List Overlay */}
        {showPlayerList && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex justify-end">
            <div className="bg-white w-3/4 max-w-sm h-full shadow-2xl p-6 flex flex-col animate-[slideInRight_0.3s_ease-out]">
               <div className="flex items-center justify-between mb-6">
                 <h3 className="text-xl font-bold text-lavender-900">Players</h3>
                 <button onClick={() => setShowPlayerList(false)} className="p-2 bg-gray-100 rounded-full text-gray-600">
                   <X size={20} />
                 </button>
               </div>
               
               <div className="flex-1 overflow-y-auto space-y-4">
                 {players.map((p, idx) => {
                   const isTurn = !winner && currentTurnPlayer?.id === p.id;
                   const isMe = p.id === me.id;
                   return (
                     <button 
                        key={p.id}
                        onClick={() => {
                          if (!isMe) {
                            setSpectatingId(p.id);
                            setShowPlayerList(false);
                          } else {
                            setSpectatingId(null);
                            setShowPlayerList(false);
                          }
                        }}
                        className={`w-full flex items-center gap-4 p-3 rounded-2xl transition-all ${isTurn ? 'bg-lavender-50 border-2 border-lavender-400' : 'hover:bg-gray-50'}`}
                     >
                        <div className={`w-12 h-12 rounded-full shadow-clay-avatar ${AVATAR_STYLES[p.avatar_idx]} flex items-center justify-center relative`}>
                           <span className="text-white font-bold text-lg drop-shadow-md">{p.name[0].toUpperCase()}</span>
                           {isTurn && <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>}
                        </div>
                        <div className="text-left flex-1">
                          <p className={`font-bold ${isMe ? 'text-lavender-700' : 'text-gray-800'}`}>
                            {p.name} {isMe && "(You)"}
                          </p>
                          <p className="text-xs text-gray-500">{p.guesses?.length || 0} guesses</p>
                        </div>
                        {!isMe && <Eye size={16} className="text-gray-300" />}
                     </button>
                   );
                 })}
               </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}