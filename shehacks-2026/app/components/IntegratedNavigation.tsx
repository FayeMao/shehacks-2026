'use client';

import { useEffect, useRef, useState } from 'react';
import ObjectDetection from './ObjectDetection';

declare global {
  interface Window {
    AFRAME: any;
    MINDAR: any;
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

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

export default function IntegratedNavigation() {
  const statusElRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState('Loading AR libraries...');
  const [destination, setDestination] = useState('exitdoor');
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef<any>(null);
  const [mindarVideoElement, setMindarVideoElement] = useState<HTMLVideoElement | null>(null);

  // Load scripts dynamically
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.AFRAME && window.MINDAR) {
      setScriptsLoaded(true);
      return;
    }

    const existingAframe = document.querySelector('script[src*="aframe"]');
    const existingMindar = document.querySelector('script[src*="mind-ar"]');

    if (existingAframe && existingMindar) {
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

  // Access video element from A-Frame/MindAR scene
  useEffect(() => {
    if (!scriptsLoaded || typeof window === 'undefined') return;
    if (!window.AFRAME || !window.MINDAR) return;

    const tryGetVideo = () => {
      const sceneEl = document.querySelector('a-scene');
      if (!sceneEl) return false;

      const scene = sceneEl as any;

      // Method 1: Try to get from MindAR system
      if (scene.systems && scene.systems['mindar-image-system']) {
        const mindarSystem = scene.systems['mindar-image-system'];
        if (mindarSystem.video && mindarSystem.video instanceof HTMLVideoElement) {
          console.log('✅ Found MindAR video element via system');
          setMindarVideoElement(mindarSystem.video);
          return true;
        }
      }

      // Method 2: Get from scene's videoEl property
      if (scene.videoEl && scene.videoEl instanceof HTMLVideoElement) {
        console.log('✅ Found MindAR video element via videoEl property');
        setMindarVideoElement(scene.videoEl);
        return true;
      }

      // Method 3: Find video element near canvas
      const canvas = sceneEl.querySelector('canvas');
      if (canvas) {
        const parent = canvas.parentElement;
        if (parent) {
          const videoEl =
            (parent.querySelector('video') as HTMLVideoElement) ||
            (Array.from(parent.children).find((el: any) => el.tagName === 'VIDEO') as HTMLVideoElement);
          if (videoEl && videoEl instanceof HTMLVideoElement) {
            setMindarVideoElement(videoEl);
            return true;
          }
        }
      }

      // Method 4: Find any video with srcObject
      const allVideos = Array.from(document.querySelectorAll('video'));
      for (const vid of allVideos) {
        if ((vid as HTMLVideoElement).srcObject && (vid as HTMLVideoElement).readyState > 0) {
          console.log('✅ Found video element in document');
          setMindarVideoElement(vid as HTMLVideoElement);
          return true;
        }
      }

      console.log('⚠️ Could not find MindAR video element yet');
      return false;
    };

    const timeout = setTimeout(() => {
      if (tryGetVideo()) return;

      const interval = setInterval(() => {
        if (tryGetVideo()) clearInterval(interval);
      }, 500);

      setTimeout(() => clearInterval(interval), 10000);
    }, 1500);

    const sceneEl = document.querySelector('a-scene');
    if (sceneEl) {
      sceneEl.addEventListener('loaded', () => {
        setTimeout(() => {
          tryGetVideo();
        }, 1000);
      });
    }

    return () => {
      clearTimeout(timeout);
    };
  }, [scriptsLoaded]);

  // Navigation logic
  useEffect(() => {
    if (!scriptsLoaded || typeof window === 'undefined') return;
    if (!window.AFRAME || !window.MINDAR) return;

    const statusEl = statusElRef.current;
    if (!statusEl) return;

    const nodes: Record<string, NodeData> = {
      elevator: { label: 'Elevator' },
      washroom: { label: 'Bathroom' },
      mainhall: { label: 'Main hall' },
      exitdoor: { label: 'Exit door' },
    };

    // 0..4 where 3 and 4 both map to exit door
    const indexToNode: Record<number, string> = {
      0: 'elevator',
      1: 'washroom',
      2: 'mainhall',
      3: 'exitdoor',
      4: 'exitdoor',
    };

    const ACTIVE_NODES = new Set(['elevator', 'washroom', 'mainhall', 'exitdoor']);

    const edges: Record<string, Edge[]> = {
      elevator: [{ to: 'washroom', say: 'Go right and walk straight.' }],
      washroom: [
        { to: 'mainhall', say: 'Walk straight.' },
        { to: 'elevator', say: 'Walk straight.' },
      ],
      mainhall: [
        { to: 'exitdoor', say: 'Go right and walk straight.' },
        { to: 'washroom', say: 'Take a left then walk straight.' },
      ],
      exitdoor: [{ to: 'mainhall', say: 'Do a 180, then walk straight.' }],
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
    let lastNode: string | null = null;
    let path: string[] | null = null;
    let pathStep = 0;

    let lastSpoken = '';

    // NEW: arrival lock so we don't keep talking after reaching destination
    let arrived = false;

    function speak(msg: string, { interrupt = false }: { interrupt?: boolean } = {}) {
      lastSpoken = msg;
      setStatus(msg);

      if (typeof window === 'undefined' || !window.speechSynthesis) {
        console.warn('SpeechSynthesis not supported');
        return;
      }

      try {
        if (interrupt) window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(msg);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onerror = (event) => {
          console.error('SpeechSynthesis error:', event);
        };

        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.error('TTS Error:', e);
      }
    }

    function finishArrival(msg: string) {
      arrived = true;
      path = null;
      pathStep = 0;
      segmentPrompted = true;
      speak(`${msg} Choose next destination.`, { interrupt: true });
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
      lastNode = null;
      path = null;
      pathStep = 0;
      segmentPrompted = false;
      lastConfirmedAt = 0;

      arrived = false;

      speak('Pick a destination to start.', { interrupt: true });
    }

    function setDestinationHandler(newDest: string) {
      destinationNode = newDest;
      currentNode = null;
      lastNode = null;
      path = null;
      pathStep = 0;
      segmentPrompted = false;
      lastConfirmedAt = 0;

      arrived = false;

      speak(`Destination set to ${nodes[destinationNode].label}. Scan the room so we can locate you.`, {
        interrupt: true,
      });
    }

    function getEdgeInstruction(from: string, to: string): string {
      const e = (edges[from] || []).find((x) => x.to === to);
      return e ? e.say : 'Keep moving forward with caution.';
    }

    function announceNextInstruction() {
      if (!path || !currentNode) return;

      if (pathStep >= path.length - 1) {
        finishArrival(`You have arrived at ${nodes[destinationNode].label}.`);
        return;
      }

      const from = path[pathStep];
      const to = path[pathStep + 1];
      const direction = getEdgeInstruction(from, to);

      speak(`You are at ${nodes[from].label}. ${direction}`, { interrupt: true });
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
      if (arrived) return;
      if (!currentNode) return;
      if (!path) return;
      if (segmentPrompted) return;

      const now = Date.now();
      if (now - lastConfirmedAt < movementPromptDelayMs) return;

      if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) return;

      segmentPrompted = true;
      speak('Keep moving forward with caution.', { interrupt: false });
    }

    const movementPromptInterval = setInterval(maybeGiveMovementPrompt, 700);

    function startRoutingFrom(nodeId: string) {
      lastNode = currentNode;
      currentNode = nodeId;
      path = bfsPath(currentNode, destinationNode);
      pathStep = 0;
      segmentPrompted = false;
      lastConfirmedAt = Date.now();

      if (!path) {
        speak('No route found from here.', { interrupt: true });
        return;
      }

      announceNextInstruction();
    }

    function bathroomArrivalMessage(cameFrom: string | null) {
      // from elevator: left, from main hall: right
      const turn = cameFrom === 'elevator' ? 'Go left.' : 'Go right.';
      finishArrival(
        `You are at ${nodes.washroom.label}. ${turn} The door is in front of you. Walk with caution and open the door to enter.`
      );
    }

    function onNodeConfirmed(nodeId: string) {
      if (!ACTIVE_NODES.has(nodeId)) return;

      // NEW: once arrived, ignore further targetFound events until destination changes or reset
      if (arrived) return;

      const cameFrom = currentNode;

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
          lastNode = cameFrom;
          currentNode = nodeId;

          if (destinationNode === 'washroom' && nodeId === 'washroom') {
            bathroomArrivalMessage(lastNode);
            return;
          }

          announceNextInstruction();
          return;
        }
      }

      if (nodeId !== currentNode) {
        lastNode = cameFrom;
        currentNode = nodeId;
        path = bfsPath(currentNode, destinationNode);
        pathStep = 0;

        if (!path) {
          speak('I cannot find a route from here.', { interrupt: true });
          return;
        }

        if (destinationNode === 'washroom' && nodeId === 'washroom') {
          bathroomArrivalMessage(lastNode);
          return;
        }

        speak(`You are at ${nodes[currentNode].label}. Re routing.`, { interrupt: true });
        setTimeout(announceNextInstruction, 350);
        return;
      }

      announceNextInstruction();
    }

    function onTargetFound(targetIndex: number) {
      const nodeId = indexToNode[targetIndex];
      if (!nodeId) return;

      if (!acceptStable(nodeId)) return;
      onNodeConfirmed(nodeId);
    }

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
    for (let i = 0; i < 5; i++) {
      const handler = () => onTargetFound(i);
      targetFoundHandlers.push(handler);
    }

    const setupTimeout = setTimeout(() => {
      const resetBtn = document.getElementById('resetBtn');
      const repeatBtn = document.getElementById('repeatBtn');
      const destEl = document.getElementById('dest') as HTMLSelectElement;

      if (resetBtn) resetBtn.addEventListener('click', handleReset);
      if (repeatBtn) repeatBtn.addEventListener('click', handleRepeat);
      if (destEl) destEl.addEventListener('change', handleDestinationChange);

      for (let i = 0; i < 5; i++) {
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

      for (let i = 0; i < 5; i++) {
        const el = document.getElementById(`t${i}`);
        if (el && targetFoundHandlers[i]) {
          el.removeEventListener('targetFound', targetFoundHandlers[i]);
        }
      };
    };
  }, [scriptsLoaded, destination]);

  // Voice recognition
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!scriptsLoaded) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech Recognition not supported in this browser');
      return;
    }

    const nodeLabels: Record<string, string> = {
      washroom: 'Bathroom',
      elevator: 'Elevator',
      mainhall: 'Main hall',
      exitdoor: 'Exit door',
    };

    const speakViaTTS = (text: string) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;

      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.error('TTS Error:', e);
      }
    };

    let shouldStop = false;

    const startRecognition = () => {
      if (shouldStop) return;

      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);

      recognition.onend = () => {
        setIsListening(false);
        if (!shouldStop) {
          setTimeout(() => {
            if (!shouldStop) startRecognition();
          }, 100);
        }
      };

      recognition.onresult = (event: any) => {
        const rawTranscript = event.results[event.results.length - 1][0].transcript;
        const transcript = rawTranscript.toLowerCase();

        const keywordMap: Record<string, string> = {
          washroom: 'washroom',
          'wash room': 'washroom',
          bathroom: 'washroom',
          'bath room': 'washroom',
          restroom: 'washroom',
          elevator: 'elevator',
          'main hall': 'mainhall',
          mainhall: 'mainhall',
          'exit door': 'exitdoor',
          exitdoor: 'exitdoor',
          exit: 'exitdoor',
        };

        let matchedDestination: string | null = null;
        for (const [keyword, dest] of Object.entries(keywordMap)) {
          if (transcript.includes(keyword)) {
            matchedDestination = dest;
            break;
          }
        }

        if (matchedDestination && matchedDestination !== destination) {
          const checkpointName = nodeLabels[matchedDestination] || matchedDestination;
          setDestination(matchedDestination);
          setStatus(`Destination set to ${checkpointName} via voice command.`);
          speakViaTTS(`Destination set to ${checkpointName}.`);
        }
      };

      recognition.onerror = (err: any) => {
        console.error('Speech Recognition Error:', err.error);
        setIsListening(false);

        if (err.error === 'not-allowed') {
          setStatus('Microphone permission denied. Please enable microphone access.');
          shouldStop = true;
        } else if (err.error !== 'aborted' && err.error !== 'no-speech') {
          if (!shouldStop) {
            setTimeout(() => {
              if (!shouldStop) startRecognition();
            }, 1000);
          }
        }
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
      } catch (e) {
        console.error('Error starting recognition:', e);
        setIsListening(false);
      }
    };

    startRecognition();

    return () => {
      shouldStop = true;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
      setIsListening(false);
    };
  }, [scriptsLoaded, destination]);

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
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
          background: rgba(0, 0, 0, 0.75);
          color: white;
          z-index: 10000;
          pointer-events: auto;
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

        button:hover:not(:disabled),
        select:hover {
          background: rgba(255, 255, 255, 0.25);
        }

        button:disabled {
          cursor: default;
          opacity: 0.9;
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

        .integrated-scene {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100vh;
          z-index: 1;
        }

        a-scene {
          z-index: 1 !important;
        }
      `,
        }}
      />

      <div id="hud">
        <div id="row">
          <label htmlFor="dest" style={{ fontSize: '14px', opacity: 0.9 }}>
            Destination
          </label>

          <select id="dest" value={destination} onChange={(e) => setDestination(e.target.value)}>
            <option value="elevator">Elevator</option>
            <option value="washroom">Bathroom</option>
            <option value="mainhall">Main hall</option>
            <option value="exitdoor">Exit door</option>
          </select>

          <button
            id="voiceBtn"
            className="voice-btn"
            disabled
            style={{
              background: isListening ? 'rgba(34, 197, 94, 0.8)' : 'rgba(156, 163, 175, 0.8)',
              cursor: 'default',
              opacity: 1,
            }}
          >
            {isListening ? '🎤 Listening...' : '🎤 Voice (starting...)'}
          </button>

          <button id="resetBtn">Reset</button>
          <button id="repeatBtn">Repeat</button>
        </div>

        <div id="status" ref={statusElRef}>
          {status}
        </div>
        <div id="small">Hold phone steady at chest height. You will hear a beep when a landmark is confirmed.</div>
      </div>

      <div className="integrated-scene" ref={sceneRef}>
        {scriptsLoaded ? (
          <>
            <a-scene
              style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh' }}
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
            </a-scene>

            {mindarVideoElement && <ObjectDetection externalVideoElement={mindarVideoElement} showUI={false} />}
          </>
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: 'white' }}>Loading AR libraries...</div>
        )}
      </div>
    </>
  );
}
