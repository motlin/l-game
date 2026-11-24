// Which game the page plays: the L game, the T game (every piece a T) or L vs T. The header's piece switch saves the
// choice and reloads the page, so it is fixed for the life of the page.
export type Piece = "L" | "T" | "LT";

function readPiece(): Piece
{
	try
	{
		const saved = localStorage.getItem("lgame-piece");
		return saved === "T" || saved === "LT" ? saved : "L";
	}
	catch
	{
		return "L";
	}
}

export const PIECE: Piece = readPiece();

// The four squares of each piece's base shape, as [row, column] offsets.
export const L_SHAPE: [number, number][] = [
	[0, 0],
	[1, 0],
	[2, 0],
	[2, 1],
];
export const T_SHAPE: [number, number][] = [
	[0, 0],
	[0, 1],
	[0, 2],
	[1, 1],
];
