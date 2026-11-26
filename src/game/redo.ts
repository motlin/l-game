// Redo for a game's Undo button. Each undo remembers the state it replaced and the state it left, as the game writes
// its state to JSON. Redo works only while the game still shows the state the last undo left, so a new move, or the
// computer moving, quietly ends it.
export class Redo
{
	private readonly undos:
	{
		before: string;
		after: string;
	}[] = [];

	// An undo took the game from before to after. An undo that changed nothing is nothing to redo.
	undone(before: string, after: string): void
	{
		if (before !== after)
			this.undos.push(
				{
					before,
					after,
				},
			);
	}

	// Whether there is an undo to take back from the state now, forgetting them all once the game has moved on.
	can(now: string): boolean
	{
		if (this.undos.at(-1)?.after === now) return true;
		this.undos.length = 0;
		return false;
	}

	// The state the last undo replaced, to go back to, or undefined when there is none.
	redo(now: string): string | undefined
	{
		return this.can(now) ? this.undos.pop()?.before : undefined;
	}
}
