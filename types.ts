
export type Player = 'W' | 'B'; // White (Light), Black (Dark)

export type GameMode = 'SOLO' | 'TWO_PLAYER';

export interface Piece {
  player: Player;
  isKing: boolean;
}

export type Square = Piece | null;

export type BoardState = Square[][];

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  from: Position;
  to: Position;
  captured?: Position[];
}

export enum GameStatus {
  PLAYING = 'PLAYING',
  WON_WHITE = 'WON_WHITE',
  WON_BLACK = 'WON_BLACK',
  DRAW = 'DRAW'
}
