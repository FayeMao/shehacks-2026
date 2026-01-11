'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    AFRAME: any;
    MINDAR: any;
    speechSynthesis: SpeechSynthesis;
  }
}

// Type declarations for A-Frame custom elements
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'a-scene': any;
      'a-camera': any;
      'a-entity': any;
    }
  }
}

interface NodeData {
  label: string;
}

interface Edge {
  to: string;
  say: string;
}

export default function NavigationPage() {
  const statusElRef = useRef<HTMLDivElement>(null);
  const sceneContainerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Loading AR libraries...');
  const [destination, setDestination] = useState('two');
  const [scriptsLoaded, setScriptsLoaded] = useState(false);

  // Load scripts dynamically
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.AFRAME && window.MINDAR) {
      setScriptsLoaded(true);
      return;
    }

    // Check if scripts are already in the document
    const existingAframe = document.querySelector('script[src*="aframe"]');
    const existingMindar = document.querySelector('script[src*="mind-ar"]');

    if (existingAframe && existingMindar) {
      // Scripts are loading, wait for them
      const checkInterval = setInterval(() => {
        if (window.AFRAME && window.MINDAR) {
          setScriptsLoaded(true);
          clearInterval(checkInterval);
        }
      }, 100);
      return () => clearInterval(checkInterval);
    }

    let aframeLoaded = false;
    let mindarLoaded = false;

    const checkAndSetLoaded = () => {
      if (aframeLoaded && mindarLoaded && window.AFRAME && window.MINDAR) {
        setScriptsLoaded(true);
      }
    };

    // Load A-Frame
    const aframeScript = document.createElement('script');
    aframeScript.src = 'https://aframe.io/releases/1.5.0/aframe.min.js';
    aframeScript.async = false;
    aframeScript.onload = () => {
      aframeLoaded = true;
      checkAndSetLoaded();
    };
    aframeScript.onerror = () => {
      console.error('Failed to load A-Frame');
    };
    document.head.appendChild(aframeScript);

    // Load MindAR after A-Frame
    const mindarScript = document.createElement('script');
    mindarScript.src = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js';
    mindarScript.async = false;
    mindarScript.onload = () => {
      mindarLoaded = true;
      checkAndSetLoaded();
    };
    mindarScript.onerror = () => {
      console.error('Failed to load MindAR');
    };
    document.head.appendChild(mindarScript);
  }, []);

  useEffect(() => {
    if (!scriptsLoaded || typeof window === 'undefined') return;
    if (!window.AFRAME || !window.MINDAR) return;

    const statusEl = statusElRef.current;
    if (!statusEl) return;

    const nodes: Record<string, NodeData> = {
      two: { label: '2 sign' },
      washroom: { label: 'Washroom' },
      couch: { label: 'Couch' },
      painting: { label: 'Painting' },
      caution: { label: 'Caution sign' },
      door: { label: 'Door' },
    };

    const indexToNode: Record<number, string> = {
      0: 'two',
      1: 'washroom',
      2: 'couch',
      3: 'painting',
      4: 'caution',
      5: 'door',
    };

    const ACTIVE_NODES = new Set(['two', 'washroom', 'caution', 'door']);

    const edges: Record<string, Edge[]> = {
      two: [{ to: 'washroom', say: 'Landmark confirmed: 2 sign. Take a right to reach the washroom.' }],
      washroom: [
        { to: 'caution', say: 'Landmark confirmed: washroom. Go straight to reach the caution sign.' },
        { to: 'two', say: 'Landmark confirmed: washroom. Go straight to reach the 2 sign.' },
      ],
      caution: [
        { to: 'door', say: 'Landmark confirmed: caution sign. Take a right to reach the door.' },
        { to: 'washroom', say: 'Landmark confirmed: caution sign. Take a left to reach the washroom.' },
      ],
      door: [{ to: 'caution', say: 'Landmark confirmed: door. Turn around, then go straight to reach the caution sign.' }],
    };

    function bfsPath(start: string, goal: string): string[] | null {
      if (start === goal) return [start];

      const q: string[] = [start];
      const prev: Record<string, string> = {};
      const seen = new Set([start]);

      while (q.length) {
        const cur = q.shift()!;
        for (const e of edges[cur] || []) {
          const nxt = e.to;
          if (seen.has(nxt)) continue;
          seen.add(nxt);
          prev[nxt] = cur;

          if (nxt === goal) {
            const path = [goal];
            let p = goal;
            while (p !== start) {
              p = prev[p];
              path.push(p);
            }
            path.reverse();
            return path;
          }
          q.push(nxt);
        }
      }
      return null;
    }

    let destinationNode = destination;
    let currentNode: string | null = null;
    let path: string[] | null = null;
    let pathStep = 0;

    let lastSpoken = '';
    function speak(msg: string, { interrupt = false }: { interrupt?: boolean } = {}) {
      lastSpoken = msg;
      setStatus(msg);

      try {
        if (interrupt) window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(msg);
        u.rate = 1.0;
        window.speechSynthesis.speak(u);
      } catch (e) {
        console.error(e);
      }
    }

    let audioCtx: AudioContext | null = null;
    function beep() {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.value = 0.08;
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start();
        setTimeout(() => o.stop(), 90);
      } catch (e) {
        console.error(e);
      }
    }

    function vibrate() {
      try {
        if (navigator.vibrate) navigator.vibrate(80);
      } catch (e) {
        console.error(e);
      }
    }

    let segmentPrompted = false;
    let lastConfirmedAt = 0;

    function resetNav() {
      currentNode = null;
      path = null;
      pathStep = 0;
      segmentPrompted = false;
      lastConfirmedAt = 0;
      speak('Pick a destination, then scan any landmark to start.', { interrupt: true });
    }

    function setDestinationHandler(newDest: string) {
      destinationNode = newDest;
      currentNode = null;
      path = null;
      pathStep = 0;
      segmentPrompted = false;
      lastConfirmedAt = 0;
      speak(`Destination set to ${nodes[destinationNode].label}. Scan any landmark to start.`, { interrupt: true });
    }

    function getEdgeInstruction(from: string, to: string): string {
      const e = (edges[from] || []).find((x) => x.to === to);
      return e ? e.say : 'Landmark confirmed. Continue forward carefully and scan again.';
    }

    function announceNextInstruction() {
      if (!path) return;

      if (pathStep >= path.length - 1) {
        speak('You have arrived.', { interrupt: true });
        return;
      }

      const from = path[pathStep];
      const to = path[pathStep + 1];
      speak(getEdgeInstruction(from, to), { interrupt: true });
    }

    const stableMs = 500;
    let candidate: string | null = null;
    let candidateSince = 0;

    function acceptStable(nodeId: string): boolean {
      const now = Date.now();
      if (candidate !== nodeId) {
        candidate = nodeId;
        candidateSince = now;
        return false;
      }
      return now - candidateSince >= stableMs;
    }

    const movementPromptDelayMs = 4500;

    function maybeGiveMovementPrompt() {
      if (!currentNode) return;
      if (!path) return;
      if (segmentPrompted) return;

      const now = Date.now();
      if (now - lastConfirmedAt < movementPromptDelayMs) return;

      segmentPrompted = true;
      speak('Keep moving forward carefully.', { interrupt: false });
    }

    const movementPromptInterval = setInterval(maybeGiveMovementPrompt, 700);

    function startRoutingFrom(nodeId: string) {
      currentNode = nodeId;
      path = bfsPath(currentNode, destinationNode);
      pathStep = 0;
      segmentPrompted = false;
      lastConfirmedAt = Date.now();

      if (!path) {
        speak('No route found from here.', { interrupt: true });
        return;
      }

      speak(`Starting at ${nodes[currentNode].label}.`, { interrupt: true });
      setTimeout(announceNextInstruction, 350);
    }

    function onNodeConfirmed(nodeId: string) {
      if (!ACTIVE_NODES.has(nodeId)) {
        console.log('IGNORED', nodeId);
        return;
      }

      window.speechSynthesis.cancel();
      lastConfirmedAt = Date.now();
      segmentPrompted = false;

      beep();
      vibrate();

      if (!currentNode || !path) {
        startRoutingFrom(nodeId);
        return;
      }

      if (pathStep < path.length - 1) {
        const expectedNext = path[pathStep + 1];
        if (nodeId === expectedNext) {
          pathStep += 1;
          currentNode = nodeId;
          announceNextInstruction();
          return;
        }
      }

      if (nodeId !== currentNode) {
        currentNode = nodeId;
        path = bfsPath(currentNode, destinationNode);
        pathStep = 0;

        if (!path) {
          speak('I cannot find a route from here.', { interrupt: true });
          return;
        }

        speak(`Re routing from ${nodes[currentNode].label}.`, { interrupt: true });
        setTimeout(announceNextInstruction, 350);
        return;
      }

      announceNextInstruction();
    }

    function onTargetFound(targetIndex: number) {
      const nodeId = indexToNode[targetIndex];
      if (!nodeId) return;
      console.log('FOUND', targetIndex, nodeId);

      if (!acceptStable(nodeId)) return;
      onNodeConfirmed(nodeId);
    }

    // Set up event handlers
    function handleRepeat() {
      if (lastSpoken) speak(lastSpoken, { interrupt: true });
    }

    function handleReset() {
      resetNav();
    }

    function handleDestinationChange(e: Event) {
      const target = e.target as HTMLSelectElement;
      setDestinationHandler(target.value);
    }

    const targetFoundHandlers: (() => void)[] = [];
    for (let i = 0; i < 6; i++) {
      const handler = () => onTargetFound(i);
      targetFoundHandlers.push(handler);
    }

    // Wait a bit for scene to be in DOM before setting up event listeners
    const setupTimeout = setTimeout(() => {
      const resetBtn = document.getElementById('resetBtn');
      const repeatBtn = document.getElementById('repeatBtn');
      const destEl = document.getElementById('dest') as HTMLSelectElement;

      if (resetBtn) resetBtn.addEventListener('click', handleReset);
      if (repeatBtn) repeatBtn.addEventListener('click', handleRepeat);
      if (destEl) destEl.addEventListener('change', handleDestinationChange);

      for (let i = 0; i < 6; i++) {
        const el = document.getElementById(`t${i}`);
        if (!el) continue;
        el.addEventListener('targetFound', targetFoundHandlers[i]);
      }

      resetNav();
    }, 200);

    return () => {
      clearTimeout(setupTimeout);
      clearInterval(movementPromptInterval);
      const resetBtn = document.getElementById('resetBtn');
      const repeatBtn = document.getElementById('repeatBtn');
      const destEl = document.getElementById('dest');
      resetBtn?.removeEventListener('click', handleReset);
      repeatBtn?.removeEventListener('click', handleRepeat);
      destEl?.removeEventListener('change', handleDestinationChange);
      for (let i = 0; i < 6; i++) {
        const el = document.getElementById(`t${i}`);
        if (el && targetFoundHandlers[i]) {
          el.removeEventListener('targetFound', targetFoundHandlers[i]);
        }
      }
    };
  }, [scriptsLoaded, destination]);

  useEffect(() => {
    // Update destination node when destination state changes
    if (scriptsLoaded) {
      const destEl = document.getElementById('dest') as HTMLSelectElement;
      if (destEl && destEl.value !== destination) {
        destEl.value = destination;
      }
    }
  }, [destination, scriptsLoaded]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        body {
          margin: 0;
          overflow: hidden;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
        }

        #hud {
          position: fixed;
          left: 12px;
          right: 12px;
          top: 12px;
          padding: 12px;
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.6);
          color: white;
          z-index: 10;
        }

        #row {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }

        select,
        button {
          border: 0;
          border-radius: 10px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.15);
          color: white;
          font-size: 14px;
          cursor: pointer;
        }

        button:hover {
          background: rgba(255, 255, 255, 0.25);
        }

        select:hover {
          background: rgba(255, 255, 255, 0.25);
        }

        #status {
          margin-top: 10px;
          font-size: 18px;
          font-weight: 650;
          line-height: 1.25;
        }

        #small {
          margin-top: 6px;
          font-size: 13px;
          opacity: 0.9;
        }
      `}} />

      <div id="hud">
        <div id="row">
          <label htmlFor="dest" style={{ fontSize: '14px', opacity: 0.9 }}>
            Destination
          </label>
          <select id="dest" value={destination} onChange={(e) => setDestination(e.target.value)}>
            <option value="two">2 sign</option>
            <option value="washroom">Washroom</option>
            <option value="caution">Caution sign</option>
            <option value="door">Door</option>
          </select>
          <button id="resetBtn">Reset</button>
          <button id="repeatBtn">Repeat</button>
        </div>

        <div id="status" ref={statusElRef}>
          {status}
        </div>
        <div id="small">Hold phone steady at chest height. You will hear a beep when a landmark is confirmed.</div>
      </div>

      {scriptsLoaded ? (
        <div ref={sceneContainerRef}>
          <a-scene
            mindar-image="imageTargetSrc: /targets.mind; autoStart: true;"
            color-space="sRGB"
            renderer="colorManagement: true"
            vr-mode-ui="enabled: false"
            device-orientation-permission-ui="enabled: true"
          >
            <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>

            <a-entity id="t0" mindar-image-target="targetIndex: 0"></a-entity>
            <a-entity id="t1" mindar-image-target="targetIndex: 1"></a-entity>
            <a-entity id="t2" mindar-image-target="targetIndex: 2"></a-entity>
            <a-entity id="t3" mindar-image-target="targetIndex: 3"></a-entity>
            <a-entity id="t4" mindar-image-target="targetIndex: 4"></a-entity>
            <a-entity id="t5" mindar-image-target="targetIndex: 5"></a-entity>
          </a-scene>
        </div>
      ) : (
        <div style={{ padding: '20px', textAlign: 'center', color: 'white' }}>
          Loading AR libraries...
        </div>
      )}
    </>
  );
}
