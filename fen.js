
import { Piece } from "./piece.js";

// FEN mappings
const FEN_TO_TYPE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const TYPE_TO_FEN = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };

export class FEN {
    static startingFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    static savedFen = localStorage.getItem('fen') || this.startingFEN;

    static parseFEN(fen) {
        if (!fen || typeof fen !== 'string' || fen.trim() === '') {
            fen = this.startingFEN;
        }
        const parts = fen.split(' ');
        if (parts.length < 6) {
            fen = this.startingFEN;
            parts.length = 0;
            Array.prototype.push.apply(parts, fen.split(' '));
        }
        const rows = parts[0].split('/');

        const board = rows.map(row => {
            const arr = [];
            for (let char of row) {
                if (isNaN(char)) {
                    const type = Piece.Type[FEN_TO_TYPE[char.toLowerCase()].toUpperCase()];
                    const color = char === char.toUpperCase() ? Piece.Color.WHITE : Piece.Color.BLACK;
                    arr.push(new Piece(type, color));
                } else {
                    for (let i = 0; i < parseInt(char); i++) {
                        arr.push(null);
                    }
                }
            }
            return arr;
        });

        const currentPlayer = parts[1] === 'w' ? Piece.Color.WHITE : Piece.Color.BLACK;
        const castlingRightsStr = parts[2];
        const enPassantStr = parts[3];
        const halfMoveClock = parseInt(parts[4], 10);
        const fullMoveNumber = parseInt(parts[5], 10);

        const castlingRights = {
            [Piece.Color.WHITE]: { kingSide: false, queenSide: false },
            [Piece.Color.BLACK]: { kingSide: false, queenSide: false }
        };

        if (castlingRightsStr && castlingRightsStr.includes('K')) castlingRights[0].kingSide = true;
        if (castlingRightsStr && castlingRightsStr.includes('Q')) castlingRights[0].queenSide = true;
        if (castlingRightsStr && castlingRightsStr.includes('k')) castlingRights[1].kingSide = true;
        if (castlingRightsStr && castlingRightsStr.includes('q')) castlingRights[1].queenSide = true;

        let enPassantTarget = null;
        if (enPassantStr && enPassantStr !== '-') {
            const file = enPassantStr.charCodeAt(0) - 'a'.charCodeAt(0);
            const rank = 8 - parseInt(enPassantStr[1], 10);
            enPassantTarget = [rank, file];
        }

        return { board, currentPlayer, castlingRights, enPassantTarget, halfMoveClock, fullMoveNumber };
    }

    static saveFEN(boardObj) {
        let board;
        let fen = '';

        if (boardObj.toPieceArray) { // Compatibility for both versions
            board = boardObj.toPieceArray();
        } else {
            board = boardObj.board;
        }

        for (let rank = 0; rank < 8; rank++) {
            let emptyCount = 0;
            for (let file = 0; file < 8; file++) {
                const piece = board[rank][file];
                if (!piece) {
                    emptyCount++;
                } else {
                    if (emptyCount > 0) {
                        fen += emptyCount;
                        emptyCount = 0;
                    }
                    const typeChar = TYPE_TO_FEN[piece.name];
                    fen += piece.color === Piece.Color.WHITE ? typeChar.toUpperCase() : typeChar;
                }
            }
            if (emptyCount > 0) fen += emptyCount;
            if (rank !== 7) fen += '/';
        }

        fen += boardObj.currentPlayer === Piece.Color.WHITE ? ' w' : ' b';
        let castling = '';
        if (boardObj.castlingRights[0].kingSide) castling += 'K';
        if (boardObj.castlingRights[0].queenSide) castling += 'Q';
        if (boardObj.castlingRights[1].kingSide) castling += 'k';
        if (boardObj.castlingRights[1].queenSide) castling += 'q';
        fen += ' ' + (castling || '-');

        if (boardObj.enPassantTarget) {
            const [r, f] = boardObj.enPassantTarget;
            fen += ' ' + String.fromCharCode(f + 97) + (8 - r);
        } else {
            fen += ' -';
        }

        fen += ' ' + boardObj.halfMoveClock + ' ' + boardObj.fullMoveNumber;
        localStorage.setItem('fen', fen);
    }
}
