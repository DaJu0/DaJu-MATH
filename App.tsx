
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Player, 
  BoardState, 
  Position, 
  Move, 
  GameStatus 
} from './types';
import { BOARD_SIZE, INITIAL_BOARD, THEME } from './constants';
import { createDamaMasterChat } from './services/geminiService';

declare var Peer: any;

// --- Types for the new flow ---
type AppViewState = 'ENTRY' | 'LOBBY' | 'GAME';

interface P2PMessage {
  type: 'MOVE' | 'SYNC' | 'CHAT' | 'STATUS' | 'DRAW_REQUEST';
  payload: any;
}

// --- Utilities ---
const createInitialBoard = (): BoardState => {
  return INITIAL_BOARD.map(row => 
    row.map(cell => {
      if (!cell) return null;
      return { player: cell as Player, isKing: false };
    })
  );
};

const isValidPos = (row: number, col: number) => 
  row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;

const CrownIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className={className}
  >
    <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z" />
  </svg>
);

const ChatIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20,2H4C2.9,2,2,2.9,2,4v18l4-4h14c1.1,0,2-0.9,2-2V4C22,2.9,21.1,2,20,2z" />
  </svg>
);

const App: React.FC = () => {
  // Navigation State
  const [appState, setAppState] = useState<AppViewState>('ENTRY');
  const [username, setUsername] = useState('');
  const [lobbyMode, setLobbyMode] = useState<'HOST' | 'JOIN' | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [opponentName, setOpponentName] = useState('Opponent');

  // P2P State
  const [myRole, setMyRole] = useState<Player | null>(null);
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);

  // Game State
  const [board, setBoard] = useState<BoardState>(createInitialBoard());
  const [currentPlayer, setCurrentPlayer] = useState<Player>('W');
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [status, setStatus] = useState<GameStatus>(GameStatus.PLAYING);

  // Chat States
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'ai' | 'peer', text: string, sender?: string}[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatSessionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isChatOpen) {
      scrollToBottom();
    }
  }, [messages, isChatOpen, isTyping]);

  // --- P2P Logic ---
  
  const setupPeer = useCallback((id: string) => {
    // We use a prefix for global uniqueness in the PeerJS network
    const fullId = `DAMA_PRO_${id}`;
    const peer = new Peer(fullId);
    peerRef.current = peer;

    peer.on('open', () => {
      console.log('Peer connected with ID:', id);
    });

    peer.on('connection', (conn: any) => {
      if (lobbyMode === 'HOST') {
        connRef.current = conn;
        setupConnection(conn);
      }
    });

    peer.on('error', (err: any) => {
      console.error('Peer error:', err);
      alert('Connection error. Returning to lobby.');
      resetToLobby();
    });
  }, [lobbyMode]);

  const setupConnection = (conn: any) => {
    conn.on('open', () => {
      setIsConnecting(true);
      // Host sends initial state and username
      if (lobbyMode === 'HOST') {
        conn.send({ 
          type: 'SYNC', 
          payload: { board: INITIAL_BOARD, currentPlayer: 'W', username } 
        });
        setMyRole('W');
        setOpponentName('Opponent...');
      } else {
        setMyRole('B');
        conn.send({ type: 'CHAT', payload: { text: `System: ${username} joined!`, sender: username } });
      }
      setTimeout(() => setAppState('GAME'), 1000);
    });

    conn.on('data', (data: P2PMessage) => {
      switch (data.type) {
        case 'MOVE':
          applyRemoteMove(data.payload);
          break;
        case 'SYNC':
          if (data.payload.board) setBoard(data.payload.board);
          if (data.payload.currentPlayer) setCurrentPlayer(data.payload.currentPlayer);
          if (data.payload.username) setOpponentName(data.payload.username);
          break;
        case 'CHAT':
          setMessages(prev => [...prev, { role: 'peer', text: data.payload.text, sender: data.payload.sender }]);
          break;
        case 'STATUS':
          setStatus(data.payload);
          break;
        case 'DRAW_REQUEST':
          if (window.confirm(`${opponentName} offered a draw. Accept?`)) {
            setStatus(GameStatus.DRAW);
            conn.send({ type: 'STATUS', payload: GameStatus.DRAW });
          }
          break;
      }
    });

    conn.on('close', () => {
      alert('Opponent disconnected.');
      resetToLobby();
    });
  };

  const resetToLobby = () => {
    if (connRef.current) connRef.current.close();
    if (peerRef.current) peerRef.current.destroy();
    setAppState('LOBBY');
    setLobbyMode(null);
    setRoomCode('');
    setIsConnecting(false);
    setMyRole(null);
    setBoard(createInitialBoard());
    setCurrentPlayer('W');
    setStatus(GameStatus.PLAYING);
    setMessages([]);
  };

  const applyRemoteMove = (move: Move) => {
    // The same logic as executeMove but without sending back
    setBoard(prevBoard => {
      const newBoard = prevBoard.map(row => [...row]);
      const { from, to, captured } = move;
      const piece = newBoard[from.row][from.col];
      if (!piece) return prevBoard;

      newBoard[to.row][to.col] = { ...piece };
      newBoard[from.row][from.col] = null;

      if (piece.player === 'W' && to.row === 0) newBoard[to.row][to.col]!.isKing = true;
      if (piece.player === 'B' && to.row === BOARD_SIZE - 1) newBoard[to.row][to.col]!.isKing = true;

      if (captured) {
        captured.forEach(pos => { newBoard[pos.row][pos.col] = null; });
      }

      // Check for winner locally
      return newBoard;
    });
    setCurrentPlayer(prev => prev === 'W' ? 'B' : 'W');
  };

  // --- Game Logic ---

  const getMovesForPiece = useCallback((row: number, col: number, currentBoard: BoardState, player: Player, jumpOnly = false): Move[] => {
    const piece = currentBoard[row][col];
    if (!piece || piece.player !== player) return [];

    const moves: Move[] = [];
    
    if (piece.isKing) {
      const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      directions.forEach(([dr, dc]) => {
        let r = row + dr;
        let c = col + dc;
        let foundOpponent = false;
        let opponentPos: Position | null = null;
        while (isValidPos(r, c)) {
          const target = currentBoard[r][c];
          if (!foundOpponent) {
            if (target === null) {
              if (!jumpOnly) moves.push({ from: { row, col }, to: { row: r, col: c } });
            } else if (target.player !== player) {
              foundOpponent = true;
              opponentPos = { row: r, col: c };
            } else break;
          } else {
            if (target === null) {
              moves.push({ from: { row, col }, to: { row: r, col: c }, captured: [opponentPos!] });
            } else break;
          }
          r += dr;
          c += dc;
        }
      });
    } else {
      const jumpDirections = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      const slideDirections = player === 'W' ? [[-1, 1], [-1, -1]] : [[1, 1], [1, -1]];
      jumpDirections.forEach(([dr, dc]) => {
        const midR = row + dr; const midC = col + dc;
        const endR = row + dr * 2; const endC = col + dc * 2;
        if (isValidPos(endR, endC)) {
          const midPiece = currentBoard[midR][midC];
          const endPiece = currentBoard[endR][endC];
          if (midPiece && midPiece.player !== player && endPiece === null) {
            moves.push({ from: { row, col }, to: { row: endR, col: endC }, captured: [{ row: midR, col: midC }] });
          }
        }
      });
      if (!jumpOnly) {
        slideDirections.forEach(([dr, dc]) => {
          const nr = row + dr; const nc = col + dc;
          if (isValidPos(nr, nc) && currentBoard[nr][nc] === null) {
            moves.push({ from: { row, col }, to: { row: nr, col: nc } });
          }
        });
      }
    }
    return moves;
  }, []);

  const getAllValidMoves = useCallback((currentBoard: BoardState, player: Player): Move[] => {
    let allMoves: Move[] = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const piece = currentBoard[r][c];
        if (piece && piece.player === player) {
          const pieceMoves = getMovesForPiece(r, c, currentBoard, player, false);
          allMoves = allMoves.concat(pieceMoves);
        }
      }
    }
    return allMoves;
  }, [getMovesForPiece]);

  const executeMove = (move: Move) => {
    const newBoard = board.map(row => [...row]);
    const { from, to, captured } = move;
    const piece = newBoard[from.row][from.col];
    if (!piece) return;

    newBoard[to.row][to.col] = { ...piece };
    newBoard[from.row][from.col] = null;

    if (piece.player === 'W' && to.row === 0) newBoard[to.row][to.col]!.isKing = true;
    if (piece.player === 'B' && to.row === BOARD_SIZE - 1) newBoard[to.row][to.col]!.isKing = true;

    if (captured) {
      captured.forEach(pos => { newBoard[pos.row][pos.col] = null; });
      const extraJumps = getMovesForPiece(to.row, to.col, newBoard, piece.player, true);
      if (extraJumps.length > 0) {
        setBoard(newBoard);
        setSelectedPos(to);
        setValidMoves(extraJumps);
        // We don't sync until turn ends, or we sync every partial move?
        // Let's sync every partial jump for clarity
        if (connRef.current) connRef.current.send({ type: 'MOVE', payload: move });
        return;
      }
    }

    setBoard(newBoard);
    setSelectedPos(null);
    setValidMoves([]);
    setCurrentPlayer(prev => prev === 'W' ? 'B' : 'W');
    
    // P2P Sync
    if (connRef.current) {
      connRef.current.send({ type: 'MOVE', payload: move });
    }
  };

  useEffect(() => {
    if (appState !== 'GAME') return;
    const availableMoves = getAllValidMoves(board, currentPlayer);
    const whiteCount = board.flat().filter(p => p?.player === 'W').length;
    const blackCount = board.flat().filter(p => p?.player === 'B').length;
    
    let newStatus = status;
    if (whiteCount === 0 || (currentPlayer === 'W' && availableMoves.length === 0)) {
      newStatus = GameStatus.WON_BLACK;
    } else if (blackCount === 0 || (currentPlayer === 'B' && availableMoves.length === 0)) {
      newStatus = GameStatus.WON_WHITE;
    }

    if (newStatus !== status) {
      setStatus(newStatus);
      if (connRef.current) connRef.current.send({ type: 'STATUS', payload: newStatus });
    }
  }, [board, currentPlayer, getAllValidMoves, appState, status]);

  const onSquareClick = (r: number, c: number) => {
    if (status !== GameStatus.PLAYING) return;
    if (currentPlayer !== myRole) return; // Not my turn!

    const targetMove = validMoves.find(m => m.to.row === r && m.to.col === c);
    if (targetMove) {
      executeMove(targetMove);
      return;
    }
    const piece = board[r][c];
    if (piece && piece.player === currentPlayer) {
      if (selectedPos && validMoves.some(m => m.captured)) {
         if (r !== selectedPos.row || c !== selectedPos.col) return;
      }
      const moves = getAllValidMoves(board, currentPlayer).filter(m => m.from.row === r && m.from.col === c);
      setSelectedPos({ row: r, col: c });
      setValidMoves(moves);
    } else {
      setSelectedPos(null);
      setValidMoves([]);
    }
  };

  const surrender = () => {
    if (status !== GameStatus.PLAYING) return;
    if (window.confirm("Surrender match to opponent?")) {
      const res = myRole === 'W' ? GameStatus.WON_BLACK : GameStatus.WON_WHITE;
      setStatus(res);
      if (connRef.current) connRef.current.send({ type: 'STATUS', payload: res });
    }
  };

  const requestDraw = () => {
    if (status !== GameStatus.PLAYING) return;
    if (connRef.current) {
      connRef.current.send({ type: 'DRAW_REQUEST', payload: null });
      alert('Draw offer sent to opponent.');
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    const userText = inputValue;
    setInputValue("");
    
    // Add to local UI
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    
    // Send to peer
    if (connRef.current) {
      connRef.current.send({ type: 'CHAT', payload: { text: userText, sender: username } });
    }

    // AI Assistant response (CHIKAHAN acts as a shared/private assistant)
    setIsTyping(true);
    try {
      if (!chatSessionRef.current) {
        chatSessionRef.current = createDamaMasterChat(board, currentPlayer);
      }
      const result = await chatSessionRef.current.sendMessage({ message: userText });
      setMessages(prev => [...prev, { role: 'ai', text: result.text }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', text: "Deep in thought... Ask again in a moment!" }]);
    } finally {
      setIsTyping(false);
    }
  };

  // --- Render Functions ---

  const renderEntryLayer = () => (
    <div className="flex flex-col items-center justify-center min-h-screen w-screen bg-slate-900 p-6 animate-in fade-in duration-700">
      <div className="w-full max-w-md space-y-8 bg-slate-800/50 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="mx-auto w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
            <CrownIcon className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-black text-white uppercase tracking-widest italic">DAMA PRO</h1>
          <p className="text-slate-400 text-sm font-medium">Identify yourself, Master.</p>
        </div>
        
        <div className="space-y-4">
          <input 
            type="text" 
            placeholder="Enter Username" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-6 py-4 text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-inner text-lg font-bold"
          />
          <button 
            disabled={!username.trim()}
            onClick={() => setAppState('LOBBY')}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:bg-slate-700 text-white font-black py-4 rounded-2xl text-lg uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-emerald-500/10"
          >
            Enter Arena
          </button>
        </div>
      </div>
    </div>
  );

  const renderLobbyLayer = () => {
    const handleHost = () => {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      setRoomCode(code);
      setLobbyMode('HOST');
      setupPeer(code);
    };

    const handleJoin = () => {
      setLobbyMode('JOIN');
      setRoomCode('');
    };

    const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.toUpperCase();
      setRoomCode(val);
      if (val.length === 6) {
        setIsConnecting(true);
        // Connect to Host
        const peer = new Peer();
        peerRef.current = peer;
        peer.on('open', () => {
          const conn = peer.connect(`DAMA_PRO_${val}`);
          connRef.current = conn;
          setupConnection(conn);
        });
        peer.on('error', (err: any) => {
          console.error('Peer error:', err);
          alert('Could not find room. Please check the code.');
          setIsConnecting(false);
          setRoomCode('');
        });
      }
    };

    return (
      <div className="flex flex-col items-center justify-center min-h-screen w-screen bg-slate-900 p-6 animate-in slide-in-from-right-10 duration-500">
        <div className="w-full max-w-md space-y-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white font-black text-xl shadow-lg">
              {username.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-tighter">Welcome Back</p>
              <h2 className="text-xl font-black text-white tracking-wide">{username}</h2>
            </div>
          </div>

          {!lobbyMode ? (
            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={handleHost}
                className="group relative h-48 bg-slate-800/50 hover:bg-slate-800 rounded-3xl border border-white/5 transition-all overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex flex-col items-center justify-center p-6 space-y-2">
                  <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 mb-2 group-hover:scale-110 transition-transform">
                     <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                  </div>
                  <h3 className="text-2xl font-black text-white uppercase italic">Host Match</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase">Play Online P2P</p>
                </div>
              </button>

              <button 
                onClick={handleJoin}
                className="group relative h-48 bg-slate-800/50 hover:bg-slate-800 rounded-3xl border border-white/5 transition-all overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex flex-col items-center justify-center p-6 space-y-2">
                  <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400 mb-2 group-hover:scale-110 transition-transform">
                     <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
                  </div>
                  <h3 className="text-2xl font-black text-white uppercase italic">Join Match</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase">Enter arena code</p>
                </div>
              </button>
            </div>
          ) : (
            <div className="bg-slate-800/50 backdrop-blur-xl p-8 rounded-3xl border border-white/10 space-y-6 animate-in zoom-in-95 duration-300">
              <div className="text-center">
                <h3 className="text-2xl font-black text-white uppercase italic mb-2">
                  {lobbyMode === 'HOST' ? 'Waiting for Player' : 'Join Arena'}
                </h3>
                <div className="flex items-center justify-center gap-2">
                   <p className="text-slate-400 text-xs font-bold uppercase">
                     {isConnecting ? 'Establishing secure connection...' : (lobbyMode === 'HOST' ? 'Share this code with your opponent' : 'Enter the code to connect')}
                   </p>
                   {isConnecting && <div className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />}
                </div>
              </div>

              {lobbyMode === 'HOST' ? (
                <div className="bg-slate-900 py-6 rounded-2xl border-2 border-emerald-500/20 text-center relative overflow-hidden">
                  <span className="text-4xl font-black text-emerald-400 tracking-[0.3em] font-mono">{roomCode}</span>
                  {isConnecting && <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 animate-loading-bar" style={{width: '100%'}} />}
                </div>
              ) : (
                <div className="space-y-4">
                  <input 
                    type="text" 
                    maxLength={6}
                    placeholder="CODE"
                    value={roomCode}
                    onChange={handleCodeChange}
                    disabled={isConnecting}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-6 py-4 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none text-center text-3xl font-black tracking-widest uppercase shadow-inner disabled:opacity-50 transition-all"
                  />
                  {isConnecting && (
                    <div className="flex justify-center">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-center">
                <button 
                  onClick={() => {
                    if (peerRef.current) peerRef.current.destroy();
                    setLobbyMode(null);
                  }}
                  disabled={isConnecting}
                  className="px-8 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white font-bold py-3 rounded-2xl uppercase text-xs tracking-widest transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGameLayer = () => (
    <div className="flex flex-col items-center justify-center min-h-screen w-screen bg-slate-900 overflow-hidden touch-none p-2 sm:p-4 animate-in fade-in duration-700">
      {/* Header - Player turn info */}
      <div className="absolute top-4 flex justify-center w-full px-6 items-center">
        <div className="flex gap-4">
          <div className={`px-4 py-1 rounded-full text-xs font-bold uppercase transition-all duration-300 ${currentPlayer === 'W' ? 'bg-white text-slate-950 scale-110 shadow-lg' : 'bg-slate-800 text-slate-400'}`}>
            {myRole === 'W' ? `(You) ${username}` : opponentName}
          </div>
          <div className={`px-4 py-1 rounded-full text-xs font-bold uppercase transition-all duration-300 ${currentPlayer === 'B' ? 'bg-slate-950 text-white scale-110 shadow-lg' : 'bg-slate-800 text-slate-400'}`}>
            {myRole === 'B' ? `(You) ${username}` : opponentName}
          </div>
        </div>
      </div>

      {/* Main Board Container */}
      <div className="relative w-full max-w-[min(90vw,90vh)] aspect-square shadow-2xl border-4 border-slate-800 rounded-xl overflow-hidden grid grid-cols-8 grid-rows-8 bg-slate-800 ring-1 ring-slate-700/50">
        {board.map((row, r) => 
          row.map((cell, c) => {
            const isDark = (r + c) % 2 !== 0;
            const isSelected = selectedPos?.row === r && selectedPos?.col === c;
            const isValidTarget = validMoves.some(m => m.to.row === r && m.to.col === c);
            const isMyTurn = cell?.player === currentPlayer && status === GameStatus.PLAYING && myRole === currentPlayer;

            return (
              <div key={`${r}-${c}`} onClick={() => onSquareClick(r, c)} className={`relative flex items-center justify-center ${isDark ? THEME.boardDark : THEME.boardLight} ${isValidTarget ? 'cursor-pointer' : ''}`}>
                {isValidTarget && <div className="absolute inset-0 bg-emerald-500/40 animate-pulse" />}
                {cell && (
                  <div className={`w-[85%] h-[85%] rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 transform ${cell.player === 'W' ? 'bg-stone-50 border-stone-300' : 'bg-slate-950 border-slate-800'} ${isMyTurn ? 'rainbow-chip' : 'border-b-4 border-r-2 opacity-95'} ${isSelected ? 'scale-110 -translate-y-1 rotate-3' : 'scale-100'}`}>
                    {cell.isKing && <CrownIcon className={`w-3/5 h-3/5 drop-shadow-md ${cell.player === 'W' ? 'text-amber-500' : 'text-amber-400'}`} />}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Victory Screen */}
        {status !== GameStatus.PLAYING && (
          <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center z-50 animate-in fade-in zoom-in duration-500" onClick={resetToLobby}>
            <div className="mb-6 p-4 rounded-full bg-white/5 border border-white/10">
               <CrownIcon className="w-16 h-16 text-amber-400 animate-bounce" />
            </div>
            <h2 className="text-3xl font-black text-white uppercase tracking-[0.2em] mb-4 drop-shadow-lg">
              {status === GameStatus.WON_WHITE ? "White Dominates" : status === GameStatus.WON_BLACK ? "Black Dominates" : "Match Drawn"}
            </h2>
            <button className="px-10 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-full text-sm uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all active:scale-95">
              Quit Match
            </button>
          </div>
        )}
      </div>

      {/* Floating Action Buttons */}
      
      {/* 1. Surrender Button (Bottom Left) */}
      <div className="fixed bottom-6 left-6 z-[100] flex flex-col items-start gap-4 pointer-events-none">
        {status === GameStatus.PLAYING && (
          <button 
            onClick={surrender}
            className="pointer-events-auto w-16 h-16 bg-red-600/90 hover:bg-red-500 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-90 ring-4 ring-slate-900 group text-3xl"
            title="Surrender Match"
          >
            <span className="group-hover:-rotate-12 transition-transform">🏳️</span>
          </button>
        )}
      </div>

      {/* 2. Draw Button (Bottom Center) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
        {status === GameStatus.PLAYING && (
          <button 
            onClick={requestDraw}
            className="pointer-events-auto w-16 h-16 bg-amber-600/90 hover:bg-amber-500 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-90 ring-4 ring-slate-900 group text-3xl"
            title="Request Draw"
          >
            <span className="group-hover:scale-110 transition-transform">🤝</span>
          </button>
        )}
      </div>

      {/* 3. Messenger-style Chat (Bottom Right) */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-4 pointer-events-none">
        {/* Messenger Window */}
        {isChatOpen && (
          <div className="pointer-events-auto w-[320px] sm:w-[360px] h-[480px] sm:h-[540px] bg-slate-900 border border-slate-700/50 rounded-2xl shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 fade-in duration-300">
            {/* Header */}
            <div className="p-4 border-b border-slate-700/50 bg-slate-800/80 backdrop-blur-md flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-inner">
                    CK
                  </div>
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-slate-900 rounded-full" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white leading-none mb-1">CHIKAHAN</h3>
                  <p className="text-[10px] text-green-400 font-medium tracking-wide">Connected with {opponentName}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsChatOpen(false)} 
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-700/50 hover:text-white rounded-full transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-900 scroll-smooth">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-4 py-2.5 text-[13px] leading-relaxed shadow-sm flex flex-col
                    ${m.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-[20px] rounded-br-[4px]' 
                      : m.role === 'peer'
                      ? 'bg-slate-700 text-slate-100 rounded-[20px] rounded-bl-[4px]'
                      : 'bg-slate-800 text-slate-100 rounded-[20px] rounded-bl-[4px]'}`}>
                    {m.sender && <span className="text-[10px] font-bold uppercase opacity-50 mb-0.5">{m.sender}</span>}
                    {m.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 px-4 py-3 rounded-[20px] rounded-bl-[4px] flex gap-1.5 items-center">
                    <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-duration:0.8s]" />
                    <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.15s]" />
                    <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.3s]" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-4 bg-slate-900 flex items-center gap-2">
              <div className="flex-1 relative">
                <input 
                  value={inputValue} 
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message..."
                  className="w-full bg-slate-800 border-none rounded-3xl pl-4 pr-10 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500/50 outline-none transition-shadow shadow-inner"
                />
              </div>
              <button 
                onClick={handleSendMessage}
                disabled={isTyping || !inputValue.trim()}
                className="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-full disabled:bg-slate-800 disabled:text-slate-600 transition-all transform active:scale-90 shadow-lg shadow-blue-600/20"
              >
                <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Floating Bubble FAB */}
        <button 
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="pointer-events-auto w-16 h-16 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 group relative ring-4 ring-slate-900"
        >
          {isChatOpen ? (
             <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
          ) : (
             <div className="relative">
                <ChatIcon className="w-8 h-8 group-hover:rotate-6 transition-transform" />
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 border-2 border-slate-900 rounded-full animate-pulse shadow-md" />
             </div>
          )}
        </button>
      </div>
    </div>
  );

  // Main Render Switch
  switch (appState) {
    case 'ENTRY':
      return renderEntryLayer();
    case 'LOBBY':
      return renderLobbyLayer();
    case 'GAME':
      return renderGameLayer();
    default:
      return renderEntryLayer();
  }
};

export default App;
