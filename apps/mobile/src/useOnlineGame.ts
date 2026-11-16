import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, Dir, GameState, ServerMessage } from '@bombarossa/game-core';

export type OnlineStatus = 'connecting' | 'lobby' | 'playing' | 'disconnected';

export function useOnlineGame(url: string) {
  const [state, setState] = useState<GameState | null>(null);
  const [myId, setMyId] = useState<number | null>(null);
  const [status, setStatus] = useState<OnlineStatus>('connecting');
  const [lobby, setLobby] = useState({ humans: 1, startsInMs: 0 });
  const wsRef = useRef<WebSocket | null>(null);
  const dirRef = useRef<Dir | null>(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;
    const send = (m: ClientMessage) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));

    ws.onopen = () => {
      setStatus('lobby');
      send({ t: 'join' });
    };
    ws.onmessage = (e) => {
      const msg: ServerMessage = JSON.parse(String(e.data));
      if (msg.t === 'welcome') setMyId(msg.playerId);
      else if (msg.t === 'lobby') setLobby({ humans: msg.humans, startsInMs: msg.startsInMs });
      else if (msg.t === 'state') {
        setStatus('playing');
        setState(msg.state);
      }
    };
    ws.onclose = () => setStatus('disconnected');
    ws.onerror = () => setStatus('disconnected');
    return () => ws.close();
  }, [url]);

  const sendInput = useCallback((dir: Dir | null, bomb: boolean) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const m: ClientMessage = { t: 'input', dir, bomb };
      ws.send(JSON.stringify(m));
    }
  }, []);

  const onDir = useCallback(
    (d: Dir | null) => {
      dirRef.current = d;
      sendInput(d, false);
    },
    [sendInput],
  );
  const onBomb = useCallback(() => sendInput(dirRef.current, true), [sendInput]);

  return { state, myId, status, lobby, onDir, onBomb };
}
