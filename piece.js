
// piece.js: piece class containing piece type and color

export class Piece {
    static Type = { NONE: 0, PAWN: 1, KNIGHT: 2, BISHOP: 3, ROOK: 4, QUEEN: 5, KING: 6 };
    static Color = { WHITE: 0, BLACK: 1 };

    constructor(type, color) {
        this.type = type;
        this.color = color;
        this.hasMoved = false;
    }

    get name() {
        for (let key in Piece.Type)
            if (Piece.Type[key] === this.type)
                return key.toLowerCase();
    }
}
