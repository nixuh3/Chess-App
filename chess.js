
// chess1.js: first version of chess engine
// All rules implemented except underpromoting

import { Piece } from "./piece.js";
import { FEN } from "./fen.js";

const DIRECTIONS = {
    rook: [[-1, 0], [1, 0], [0, -1], [0, 1]],
    bishop: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    queen: [], // will combine rook + bishop
    king: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]],
    knight: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
};
DIRECTIONS.queen = DIRECTIONS.rook.concat(DIRECTIONS.bishop);

class GenerateMoves {
    static generateSlidingMoves(board, rank, file, dirs, maxSteps = 8) {
        const moves = [];
        const piece = board[rank][file];
        if (!piece) return moves;
        const color = piece.color;

        for (let [dr, df] of dirs) {
            let r = rank + dr, f = file + df;
            let step = 1;

            while (r >= 0 && r < 8 && f >= 0 && f < 8 && step <= maxSteps) {
                const target = board[r][f];
                if (!target) {
                    moves.push([r, f]);
                } else {
                    if (target.color !== color) moves.push([r, f]);
                    break;
                }
                r += dr;
                f += df;
                step++;
            }
        }
        return moves;
    }

    static generateKnightMoves(board, rank, file) {
        return this.generateSlidingMoves(board, rank, file, DIRECTIONS.knight, 1);
    }

    static generatePawnMoves(board, rank, file, enPassantTarget, forAttack = false) {
        const moves = [];
        const piece = board[rank][file];
        if (!piece) return moves;
        const dir = piece.color === Piece.Color.WHITE ? -1 : 1;
        const nextRank = rank + dir;

        if (!forAttack) {
            // Forward move
            if (nextRank >= 0 && nextRank < 8 && !board[nextRank][file]) {
                moves.push([nextRank, file]);
                const start = piece.color === Piece.Color.WHITE ? 6 : 1;
                const doubleStepRank = rank + 2 * dir;

                if (rank === start && !board[doubleStepRank][file]) {
                    moves.push([doubleStepRank, file]);
                }
            }
        }

        // Captures
        for (let df of [-1, 1]) {
            const captureFile = file + df;
            if (captureFile >= 0 && captureFile < 8) {
                const target = board[nextRank][captureFile];

                if (target && target.color !== piece.color) {
                    moves.push([nextRank, captureFile]);
                }
                // en Passant
                if (GenerateMoves.isEnPassantSquare(piece, rank, file, nextRank, captureFile, enPassantTarget)) {
                    moves.push([nextRank, captureFile]);
                }
            }
        }
        return moves;
    }

    static generateKingMoves(board, rank, file, forAttack = false, castlingRights = null) {
        const piece = board[rank][file];
        if (!piece) return [];
        let moves = this.generateSlidingMoves(board, rank, file, DIRECTIONS.king, 1);
        if (forAttack) return moves;

        // Castling
        const homeRank = piece.color === Piece.Color.WHITE ? 7 : 0;
        if (!piece.hasMoved && rank === homeRank && file === 4) {
            for (let side of ['K', 'Q']) {
                if (Board.canCastle(board, piece.color, side, castlingRights)) {
                    moves.push(side === 'K' ? [homeRank, 6] : [homeRank, 2]);
                }
            }
        }
        return moves;
    }

    static generateMovesOfPiece(board, rank, file, enPassantTarget, forAttack = false, castlingRights = null) {
        let list = [];
        const piece = board[rank][file];

        switch (piece.type) {
            case Piece.Type.ROOK: list = this.generateSlidingMoves(board, rank, file, DIRECTIONS.rook); break;
            case Piece.Type.BISHOP: list = this.generateSlidingMoves(board, rank, file, DIRECTIONS.bishop); break;
            case Piece.Type.QUEEN: list = this.generateSlidingMoves(board, rank, file, DIRECTIONS.queen); break;
            case Piece.Type.KNIGHT: list = this.generateKnightMoves(board, rank, file); break;
            case Piece.Type.KING: list = this.generateKingMoves(board, rank, file, forAttack, castlingRights); break;
            case Piece.Type.PAWN: list = this.generatePawnMoves(board, rank, file, enPassantTarget, forAttack); break;
        }
        return list;
    }

    static generateAllMoves(board, color, enPassantTarget, forAttack = false, castlingRights = null) {
        const moves = [];
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = board[rank][file];
                if (!piece || piece.color !== color) continue;
                const list = this.generateMovesOfPiece(board, rank, file, enPassantTarget, forAttack, castlingRights);
                for (const [toRank, toFile] of list) {
                    moves.push([rank, file, toRank, toFile]);
                }
            }
        }
        return moves;
    }

    static isEnPassantSquare(piece, fromRank, fromFile, toRank, toFile, enPassantTarget) {
        return (
            piece.type === Piece.Type.PAWN &&
            fromFile !== toFile &&
            enPassantTarget &&
            enPassantTarget[0] === toRank &&
            enPassantTarget[1] === toFile
        );
    }
}

class Board {
    static moveType = { NORMAL: 0, CASTLE: 1, CAPTURE: 2, PROMOTION: 3, CHECK: 4 };
    static GameState = { PLAYING: 0, CHECKMATE: 1, DRAW_MATERIAL: 2, DRAW_50_MOVE: 3, DRAW_STALEMATE: 4, DRAW_3FOLD: 5 };

    constructor(fen) {
        const {
            board,
            currentPlayer,
            castlingRights,
            enPassantTarget,
            halfMoveClock,
            fullMoveNumber
        } = FEN.parseFEN(fen);

        this.board = board;
        this.currentPlayer = currentPlayer;
        this.castlingRights = castlingRights;
        this.enPassantTarget = enPassantTarget;
        this.halfMoveClock = halfMoveClock;
        this.fullMoveNumber = fullMoveNumber;

        if (Board.isInCheck(board, this.#opponentOf(currentPlayer))) {
            throw new Error("Invalid position. Current player can capture opponent's king.");
        }

        this.repetitionHistory = new Map();
        this.repetitionHistory.set(this.#getRepetitionKey(), 1);
    }

    move(fromRank, fromFile, toRank, toFile) {
        const cloned = this.#cloneBoard();
        const result = this.#applyMove(cloned, fromRank, fromFile, toRank, toFile, this.enPassantTarget);

        const enemy = this.#opponentOf(this.currentPlayer);
        if (Board.isInCheck(result.board, enemy))
            result.moveType = Board.moveType.CHECK;

        this.halfMoveClock++;
        if (result.moveType === Board.moveType.CAPTURE || this.board[fromRank][fromFile].type === Piece.Type.PAWN) {
            this.halfMoveClock = 0;
        }

        this.castlingRights = result.castlingRights;
        this.board = result.board;
        this.enPassantTarget = result.enPassantTarget;
        this.currentPlayer = enemy;

        return result;
    }

    simulateMove(fromRank, fromFile, toRank, toFile) {
        const clonedBoard = this.#cloneBoard();
        const result = this.#applyMove(clonedBoard, fromRank, fromFile, toRank, toFile, this.enPassantTarget);
        return {
            board: result.board,
            enPassantTarget: result.enPassantTarget,
            castlingRights: result.castlingRights,
            currentPlayer: this.#opponentOf(this.currentPlayer)
        };
    }

    #applyMove(board, fromRank, fromFile, toRank, toFile, enPassantTarget) {
        let moveType = Board.moveType.NORMAL;
        const original = board[fromRank][fromFile];
        const piece = Object.assign(new Piece(original.type, original.color), { hasMoved: original.hasMoved });
        board[fromRank][fromFile] = piece;

        let captured = board[toRank][toFile];
        const hadMoved = piece.hasMoved;
        let enPassantCapture = null;

        // En passant capture
        if (GenerateMoves.isEnPassantSquare(piece, fromRank, fromFile, toRank, toFile, enPassantTarget) && !captured) {
            const captureRank = toRank + (piece.color === Piece.Color.WHITE ? 1 : -1);
            captured = board[captureRank][toFile];
            board[captureRank][toFile] = null;
            enPassantCapture = [captureRank, toFile];
            moveType = Board.moveType.CAPTURE;
        }

        // Normal capture
        if (captured) {
            moveType = Board.moveType.CAPTURE;
        }

        // Castling
        let castleInfo = null;
        if (piece.type === Piece.Type.KING && !hadMoved && fromRank === (piece.color === Piece.Color.WHITE ? 7 : 0) && fromFile === 4) {
            let side = toFile === 6 ? 'K' : toFile === 2 ? 'Q' : null;
            if (side && Board.canCastle(board, piece.color, side, this.castlingRights)) {
                board[toRank][toFile] = piece;
                board[fromRank][fromFile] = null;
                castleInfo = Board.#performCastle(board, piece.color, side);
                moveType = Board.moveType.CASTLE;
            } else {
                board[toRank][toFile] = piece;
                board[fromRank][fromFile] = null;
            }
        } else {
            board[toRank][toFile] = piece;
            board[fromRank][fromFile] = null;
        }

        piece.hasMoved = true;

        // Promotion
        if (piece.type === Piece.Type.PAWN && (toRank === 0 || toRank === 7)) {
            piece.type = Piece.Type.QUEEN;
            moveType = Board.moveType.PROMOTION;
        }

        // Update en passant target
        const newEnPassantTarget = (piece.type === Piece.Type.PAWN && Math.abs(toRank - fromRank) === 2)
            ? [fromRank + (toRank - fromRank) / 2, fromFile]
            : null;

        // Update castling rights
        const castlingRights = {
            [Piece.Color.WHITE]: { ...this.castlingRights[Piece.Color.WHITE] },
            [Piece.Color.BLACK]: { ...this.castlingRights[Piece.Color.BLACK] }
        };
        const enemyColor = piece.color === Piece.Color.WHITE ? Piece.Color.BLACK : Piece.Color.WHITE;

        if (piece.type === Piece.Type.KING) {
            castlingRights[piece.color] = { kingSide: false, queenSide: false };
        }
        if (piece.type === Piece.Type.ROOK && fromRank === (piece.color === Piece.Color.WHITE ? 7 : 0)) {
            if (fromFile === 0) castlingRights[piece.color].queenSide = false;
            if (fromFile === 7) castlingRights[piece.color].kingSide = false;
        }
        if (captured && captured.type === Piece.Type.ROOK && toRank === (enemyColor === Piece.Color.WHITE ? 7 : 0)) {
            if (toFile === 0) castlingRights[enemyColor].queenSide = false;
            if (toFile === 7) castlingRights[enemyColor].kingSide = false;
        }

        return {
            board,
            from: [fromRank, fromFile],
            to: [toRank, toFile],
            enPassantTarget: newEnPassantTarget,
            enPassantCapture,
            castle: castleInfo,
            moveType,
            castlingRights
        };
    }

    gameEnd(currentPlayer) {
        if (this.#hasInsufficientMaterial(this.board)) {
            return Board.GameState.DRAW_MATERIAL;
        }
        if (this.halfMoveClock >= 50) {
            return Board.GameState.DRAW_50_MOVE;
        }

        const key = this.#getRepetitionKey();
        this.repetitionHistory.set(key, (this.repetitionHistory.get(key) || 0) + 1);
        if (this.repetitionHistory.get(key) >= 3) {
            return Board.GameState.DRAW_3FOLD;
        }

        const legalMoves = GenerateMoves.generateAllMoves(this.board, currentPlayer, this.enPassantTarget, false, this.castlingRights)
            .filter(([fromR, fromF, toR, toF]) => {
                const simulated = this.simulateMove(fromR, fromF, toR, toF);
                return !Board.isInCheck(simulated.board, currentPlayer);
            });

        if (legalMoves.length > 0) return Board.GameState.PLAYING;
        return Board.isInCheck(this.board, currentPlayer) ? Board.GameState.CHECKMATE : Board.GameState.DRAW_STALEMATE;
    }

    #hasInsufficientMaterial(board) {
        const pieces = board.flat().filter(p => p);

        if (pieces.length === 2) return true; // king vs king

        if (pieces.length === 3) {
            // king + 1 minor piece vs king
            const minor = pieces.find(p => p.type !== Piece.Type.KING);
            if (minor && (minor.type === Piece.Type.BISHOP || minor.type === Piece.Type.KNIGHT)) {
                return true;
            }
        }

        if (pieces.length === 4) {
            const bishops = pieces.filter(p => p.type === Piece.Type.BISHOP);
            if (bishops.length === 2) {
                // Check has each 1 bishop
                const whiteBishop = bishops.find(b => b.color === Piece.Color.WHITE);
                const blackBishop = bishops.find(b => b.color === Piece.Color.BLACK);
                if (whiteBishop && blackBishop) {
                    // Check if on same color
                    const squareColor = (p) => {
                        const idx = board.flat().indexOf(p);
                        return (Math.floor(idx / 8) + idx % 8) % 2;
                    };
                    if (squareColor(whiteBishop) === squareColor(blackBishop)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    static isInCheck(board, color) {
        const [kR, kF] = Board.findPiece(board, Piece.Type.KING, color);
        return Board.isSquareAttacked(board, kR, kF, color === Piece.Color.WHITE ? Piece.Color.BLACK : Piece.Color.WHITE);
    }

    static isSquareAttacked(board, rank, file, byColor) {
        return GenerateMoves.generateAllMoves(board, byColor, null, true)
            .some(([, , toR, toF]) => toR === rank && toF === file);
    }

    static canCastle(board, player, side, castlingRights) {
        const rank = player === Piece.Color.WHITE ? 7 : 0;
        const king = board[rank][4];
        const rook = board[rank][side === 'K' ? 7 : 0];
        const rights = castlingRights[player];

        if (!rights
            || (side === 'K' && !rights.kingSide) || (side === 'Q' && !rights.queenSide)
            || !king || !rook
            || king.type !== Piece.Type.KING || rook.type !== Piece.Type.ROOK
            || king.color !== player || rook.color !== player
            || king.hasMoved || rook.hasMoved) {
            return false;
        }

        const between = side === 'K' ? [5, 6] : [1, 2, 3];
        if (between.some(f => board[rank][f] !== null)) {
            return false;
        }

        const checkSquares = side === 'K' ? [4, 5, 6] : [4, 3, 2];
        for (const f of checkSquares) {
            if (Board.isSquareAttacked(board, rank, f, player === Piece.Color.WHITE ? Piece.Color.BLACK : Piece.Color.WHITE)) {
                return false;
            }
        }

        return true;
    }

    static #performCastle(board, color, side) {
        const rank = color === Piece.Color.WHITE ? 7 : 0;
        const fromFile = side === 'K' ? 7 : 0;
        const toFile = side === 'K' ? 5 : 3;
        const rook = board[rank][fromFile];
        board[rank][toFile] = rook;
        board[rank][fromFile] = null;
        rook.hasMoved = true;
        return { rookFrom: [rank, fromFile], rookTo: [rank, toFile] };
    }

    static findPiece(board, type, color) {
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const p = board[rank][file];
                if (p && p.type === type && p.color === color) {
                    return [rank, file];
                }
            }
        }
    }

    #cloneBoard() {
        return this.board.map(row => row.map(p => p ? Object.assign(new Piece(p.type, p.color), { hasMoved: p.hasMoved }) : null));
    }

    #opponentOf(color) {
        return color === Piece.Color.WHITE ? Piece.Color.BLACK : Piece.Color.WHITE;
    }

    #getRepetitionKey() {
        return JSON.stringify({
            board: this.board.map(row => row.map(p => {
                return p ? { type: p.type, color: p.color } : null;
            })),
            currentPlayer: this.currentPlayer,
            castlingRights: this.castlingRights,
            enPassantTarget: this.enPassantTarget
        });
    }
}

class UI {
    static Sounds = {
        move: new Audio('assets/sounds/move.mp3'),
        capture: new Audio('assets/sounds/capture.mp3'),
        check: new Audio('assets/sounds/check.mp3'),
        castle: new Audio('assets/sounds/castle.mp3'),
        promote: new Audio('assets/sounds/promote.mp3'),
        gameEnd: new Audio('assets/sounds/game-end.mp3'),
        gameStart: new Audio('assets/sounds/game-start.mp3')
    };

    static createBoard(boardElement, boardObj) {
        this.boardElement = boardElement;
        boardElement.innerHTML = boardObj.board.flat().map((piece, index) => {
            const isLight = ((Math.floor(index / 8) + index % 8) & 1) === 0;
            return /*html*/ `
        <div class="square ${isLight ? 'light' : 'dark'}">
          ${piece ? UI.#getImgHTML(piece) : ''}
        </div>
      `
        }).join('');
        this.#attachListeners(boardObj);
    }

    static highlightMoves(moves) {
        for (const [r, f] of moves) {
            const index = r * 8 + f;
            document.querySelectorAll('.square')[index].classList.add('highlight');
        }
    }

    static #clearHighlights() {
        document.querySelectorAll('.square').forEach(s => s.classList.remove('highlight'));
    }

    static #playSound(moveType) {
        UI.Sounds[moveType === Board.moveType.CAPTURE ? 'capture'
            : moveType === Board.moveType.CHECK ? 'check'
                : moveType === Board.moveType.CASTLE ? 'castle'
                    : moveType === Board.moveType.PROMOTION ? 'promote'
                        : 'move'].
            play();
    }

    static #getImgHTML(piece) {
        const name = piece.name;
        const color = piece.color === Piece.Color.WHITE ? 'white' : 'black';
        return `<img src="assets/images/${color}_${name}.png" class="piece"/>`;
    }

    static #attachListeners(boardObj) {
        this.boardElement.querySelectorAll('.square').forEach((square, index) => {
            square.onclick = () => UI.#handleClick(boardObj, index);
        });

        document.getElementById('restart').onclick = () => {
            UI.Sounds.gameStart.play();
            setTimeout(() => {
                localStorage.removeItem('fen');
                location.reload();
            }, 300);
        };
    }

    static updateBoardForMove(result) {
        result.changed = [result.from, result.to];
        if (result.enPassantCapture)
            result.changed.push(result.enPassantCapture);
        if (result.castle)
            result.changed.push(result.castle.rookFrom, result.castle.rookTo);

        for (let [r, f] of result.changed) {
            const square = document.querySelectorAll('.square')[r * 8 + f];
            while (square.firstChild) {
                square.removeChild(square.firstChild);
            }
            const piece = game.board[r][f];
            if (piece)
                square.innerHTML = UI.#getImgHTML(piece);
        }

        UI.#playSound(result.moveType);
        FEN.saveFEN(game);
    }

    static alertGameEndMessage() {
        let state = game.gameEnd(game.currentPlayer);
        setTimeout(() => {
            if (state !== Board.GameState.PLAYING) {
                UI.Sounds.gameEnd.play();
                localStorage.removeItem('fen');
            }

            if (state === Board.GameState.DRAW_50_MOVE) {
                alert('Draw by 50-move rule');
            } else if (state === Board.GameState.DRAW_MATERIAL) {
                alert('Draw by insufficient material');
            } else if (state === Board.GameState.DRAW_STALEMATE) {
                alert('Draw by stalemate');
            } else if (state === Board.GameState.DRAW_3FOLD) {
                alert('Draw by repetition');
            } else if (state === Board.GameState.CHECKMATE) {
                alert(`Checkmate!\n${game.currentPlayer === Piece.Color.WHITE ? 'Black' : 'White'} wins`);
            }
        }, 300);
    }

    static #handleClick(boardObj, index) {
        if (boardObj.currentPlayer === AI.AIColor) return;

        const rank = Math.floor(index / 8);
        const file = index % 8;
        const piece = boardObj.board[rank][file];

        UI.#clearHighlights();

        // If clicked the same piece, clear selection
        if (selected.from && selected.from[0] === rank && selected.from[1] === file) {
            selected.clear();
            return;
        }

        if (selected.from && selected.moves.some(([r, f]) => r === rank && f === file)) {
            const [fromRank, fromFile] = selected.from;
            const result = boardObj.move(fromRank, fromFile, rank, file);

            UI.updateBoardForMove(result);
            selected.clear();

            UI.alertGameEndMessage();
            if (playAI) {
                setTimeout(() => AI.move(boardObj), 500);
            }
            return;
        }

        if (piece && piece.color === boardObj.currentPlayer) {
            selected.from = [rank, file];
            selected.moves = GenerateMoves.generateMovesOfPiece(boardObj.board, rank, file, boardObj.enPassantTarget, false, boardObj.castlingRights)
                .filter(([toR, toF]) => {
                    const simulated = boardObj.simulateMove(rank, file, toR, toF);
                    return !Board.isInCheck(simulated.board, boardObj.currentPlayer);
                });

            UI.highlightMoves(selected.moves);
            document.querySelectorAll('.square')[index].classList.add('highlight');
        } else {
            selected.clear();
        }
    }
}

class AI {
    static AIColor = Piece.Color.BLACK;

    static move(boardObj) {
        const pseudoLegalMoves = GenerateMoves.generateAllMoves(boardObj.board, AI.AIColor, boardObj.enPassantTarget, false, boardObj.castlingRights);
        const legalMoves = pseudoLegalMoves.filter(([fromR, fromF, toR, toF]) => {
            const simulated = boardObj.simulateMove(fromR, fromF, toR, toF);
            return !Board.isInCheck(simulated.board, AI.AIColor);
        });

        if (legalMoves.length === 0) {
            return;
        }

        const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
        const result = boardObj.move(...randomMove);
        UI.updateBoardForMove(result);
        UI.alertGameEndMessage();
    }
}

const playAI = true;
const boardElement = document.querySelector('.board');

let game = new Board(FEN.savedFen);
let selected = {
    from: null, moves: [], clear() {
        this.from = null;
        this.moves = [];
    }
};

UI.createBoard(boardElement, game);

window.onload = () => {
    if (playAI) {
        if (game.currentPlayer === AI.AIColor) {
            setTimeout(() => AI.move(game), 900);
        }
    }
};