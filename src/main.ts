import { Game } from './core/Game';

const game = new Game(document.getElementById('game')!);
// Expose for automated browser tests.
(window as unknown as { __game: Game }).__game = game;
