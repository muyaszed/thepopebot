'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SerializeAddon } from '@xterm/addon-serialize';
import { AppSidebar } from '../chat/components/app-sidebar.js';
import { SidebarProvider, SidebarInset } from '../chat/components/ui/sidebar.js';
import { ChatNavProvider } from '../chat/components/chat-nav-context.js';
import { ChatHeader } from '../chat/components/chat-header.js';
import '@xterm/xterm/css/xterm.css';

const STATUS = { connected: '#22c55e', connecting: '#eab308', disconnected: '#ef4444' };
const RECONNECT_INTERVAL = 3000;

export default function CodePage({ session, claudeWorkspaceId }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);
  const retryTimer = useRef(null);
  const statusRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const setStatus = useCallback((color) => {
    if (statusRef.current) statusRef.current.style.backgroundColor = color;
    setConnected(color === STATUS.connected);
  }, []);

  const sendResize = useCallback(() => {
    const fit = fitAddonRef.current;
    const ws = wsRef.current;
    const term = termRef.current;
    if (!fit || !term || !ws || ws.readyState !== WebSocket.OPEN) return;
    fit.fit();
    const payload = JSON.stringify({ columns: term.cols, rows: term.rows });
    ws.send('1' + payload);
  }, []);

  const connect = useCallback(() => {
    const term = termRef.current;
    if (!term) return;

    setStatus(STATUS.connecting);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/code/${claudeWorkspaceId}/ws`);
    wsRef.current = ws;

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      // ttyd handshake — AuthToken is ttyd's internal field, not a Claude token
      const handshake = JSON.stringify({ AuthToken: '', columns: term.cols, rows: term.rows });
      ws.send(handshake);
      setStatus(STATUS.connected);
    };

    ws.onmessage = (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
      const type = data[0];
      const payload = data.slice(1);

      switch (type) {
        case '0': // output
          term.write(payload);
          break;
        case '1': // title
          document.title = payload || 'Claude Code';
          break;
        case '2': // prefs (ignored)
          break;
      }
    };

    ws.onclose = () => {
      setStatus(STATUS.disconnected);
      retryTimer.current = setTimeout(connect, RECONNECT_INTERVAL);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [claudeWorkspaceId, setStatus]);

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 16,
      fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", Menlo, monospace',
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#c0caf5',
        selectionBackground: '#33467c',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();
    const serializeAddon = new SerializeAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(serializeAddon);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    term.open(containerRef.current);

    // Override xterm.js internal backgrounds so leftover pixels match the theme
    const style = document.createElement('style');
    style.textContent = '.xterm, .xterm-viewport { background-color: #1a1b26 !important; }';
    containerRef.current.appendChild(style);

    fitAddon.fit();

    // Input → WebSocket
    term.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send('0' + data);
      }
    });

    // Resize handling
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(sendResize, 100);
    };
    window.addEventListener('resize', handleResize);

    connect();

    return () => {
      clearTimeout(resizeTimeout);
      clearTimeout(retryTimer.current);
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) wsRef.current.close();
      term.dispose();
    };
  }, [connect, sendResize]);

  const handleReconnect = () => {
    clearTimeout(retryTimer.current);
    if (wsRef.current) wsRef.current.close();
    connect();
  };


  return (
    <ChatNavProvider value={{ activeChatId: null, navigateToChat: (id) => { window.location.href = id ? `/chat/${id}` : '/'; } }}>
      <SidebarProvider>
        <AppSidebar user={session.user} />
        <SidebarInset>
          <div className="flex h-svh flex-col overflow-hidden">
            <ChatHeader workspaceId={claudeWorkspaceId} />
            <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
              <div ref={containerRef} className="mx-4" style={{ height: '100%', borderRadius: 6, overflow: 'hidden' }} />
              {!connected && (
                <div style={{
                  position: 'absolute',
                  top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: 'rgba(255,255,255,0.9)',
                  color: '#000',
                  padding: '12px 24px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  zIndex: 10,
                }}>
                  Loading...
                </div>
              )}
            </div>

            {/* Toolbar */}
            <div
              style={{
                flexShrink: 0,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
              }}
            >
              <div />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={handleReconnect} style={{ ...btnStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div
                    ref={statusRef}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: STATUS.connecting,
                    }}
                  />
                  Reconnect
                </button>
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ChatNavProvider>
  );
}

const btnStyle = {
  background: 'transparent',
  border: '1px solid #d1d5db',
  color: 'inherit',
  padding: '4px 10px',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'inherit',
};
