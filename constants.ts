
export const BOARD_SIZE = 8;

export const THEME = {
  boardLight: 'bg-slate-200',
  boardDark: 'bg-slate-700',
  pieceWhite: 'bg-stone-100',
  pieceBlack: 'bg-slate-900',
  accentWhite: 'border-stone-400',
  accentBlack: 'border-slate-600',
  highlight: 'bg-emerald-400/50',
  lastMove: 'bg-amber-400/30'
};

export const INITIAL_BOARD: string[][] = [
  ['', 'B', '', 'B', '', 'B', '', 'B'],
  ['B', '', 'B', '', 'B', '', 'B', ''],
  ['', 'B', '', 'B', '', 'B', '', 'B'],
  ['', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', ''],
  ['W', '', 'W', '', 'W', '', 'W', ''],
  ['', 'W', '', 'W', '', 'W', '', 'W'],
  ['W', '', 'W', '', 'W', '', 'W', ''],
];
