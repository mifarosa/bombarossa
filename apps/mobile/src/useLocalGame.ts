import { useCallback, useEffect, useReducer, useRef } from 'react';
import { Dir, GameState, TICK_RATE, botInput, createGame, step } from '@bombarossa/game-core';

const TICK_MS = 1000 / TICK_RATE;

/** Single-player: runs the shared game-core locally, player 0 is human, the rest are bots. */
export function useLocalGame(botCount = 3) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const stateRef = useRef<GameState | null>(null);
  const dirRef = useRef<Dir | null>(null);
  const bombRef = useRef(false);

  if (!stateRef.current) {
    stateRef.current = createGame((Math.random() * 2 ** 32) >>> 0, botCount + 1);
  }

  useEffect(() => {
    let last = Date.now();
    let acc = 0;
    const timer = setInterval(() => {
      const state = stateRef.current!;
      const now = Date.now();
      acc += now - last;
      last = now;
      let stepped = false;
      for (let n = 0; acc >= TICK_MS && n < 5; n++) {
        acc -= TICK_MS;
        const inputs: Record<number, ReturnType<typeof botInput>> = {
          0: { dir: dirRef.current, bomb: bombRef.current },
        };
        bombRef.current = false;
        for (let id = 1; id < state.players.length; id++) inputs[id] = botInput(state, id);
        step(state, inputs);
        stepped = true;
      }
      if (stepped) rerender();
    }, 16);
    return () => clearInterval(timer);
  }, []);

  const onDir = useCallback((d: Dir | null) => {
    dirRef.current = d;
  }, []);
  const onBomb = useCallback(() => {
    bombRef.current = true;
  }, []);

  return { state: stateRef.current, myId: 0, onDir, onBomb };
}
