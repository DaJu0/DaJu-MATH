
import { GoogleGenAI, Type, Chat } from "@google/genai";
import { BoardState, Player, Move } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getBestMove = async (board: BoardState, player: Player): Promise<Move | null> => {
  try {
    const serializedBoard = board.map(row => 
      row.map(cell => cell ? `${cell.player}${cell.isKing ? 'K' : ''}` : '.')
    );

    const prompt = `You are a professional Dama (Checkers) grandmaster AI. 
    Analyze this 8x8 checkers board and suggest the absolute best move for player '${player}'.
    Board rules: Standard International Checkers (diagonals only, captures mandatory).
    Current Board: ${JSON.stringify(serializedBoard)}
    Current Player: ${player}
    
    Return the move in JSON format strictly matching this schema:
    { "from": { "row": number, "col": number }, "to": { "row": number, "col": number } }
    Only return the JSON. No other text.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            from: {
              type: Type.OBJECT,
              properties: {
                row: { type: Type.INTEGER },
                col: { type: Type.INTEGER }
              },
              required: ["row", "col"]
            },
            to: {
              type: Type.OBJECT,
              properties: {
                row: { type: Type.INTEGER },
                col: { type: Type.INTEGER }
              },
              required: ["row", "col"]
            }
          },
          required: ["from", "to"]
        }
      }
    });

    const moveData = JSON.parse(response.text.trim());
    return moveData as Move;
  } catch (error) {
    console.error("Gemini AI move error:", error);
    return null;
  }
};

export const createDamaMasterChat = (board: BoardState, currentPlayer: Player): Chat => {
  const serializedBoard = board.map(row => 
    row.map(cell => cell ? `${cell.player}${cell.isKing ? 'K' : ''}` : '.')
  );

  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: `You are a "Dama Master", a friendly and professional checkers grandmaster. 
      The current player is ${currentPlayer === 'W' ? 'White' : 'Black'}. 
      The board state is: ${JSON.stringify(serializedBoard)}. 
      Help the user with strategy, explain moves, or just chat about Dama. Keep responses concise and encouraging. 
      Standard rules: captures are possible in all 4 directions for everyone, but kings move long distances.`,
    },
  });
};
