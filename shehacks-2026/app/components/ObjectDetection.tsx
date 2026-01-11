'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Camera, Square, MapPin } from 'lucide-react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

// Define checkpoint interface
interface Checkpoint {
  id: string;
  name: string;
  targetObjects: string[];
  reached: boolean;
}

interface ObjectDetectionProps {
  externalVideoElement?: HTMLVideoElement | null;
  autoStart?: boolean;
  showUI?: boolean;
}

const ObjectDetection = ({ externalVideoElement, autoStart = false, showUI = true }: ObjectDetectionProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Refs for throttling and state tracking
  const lastAnnouncementRef = useRef<string>('');
  const lastAnnouncementTimeRef = useRef<number>(0);
  const lastProximityAlertRef = useRef<number>(0);
  
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detections, setDetections] = useState<cocoSsd.DetectedObject[]>([]);
  const [useCamera, setUseCamera] = useState(false);
  const [error, setError] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Navigation-specific state - matching navigation landmarks
  // Note: COCO-SSD doesn't detect doors/elevators, so we use objects commonly found in these areas
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([
    { id: 'elevator', name: 'Elevator', targetObjects: ['person'], reached: false },
    { id: 'washroom', name: 'Washroom', targetObjects: ['toilet', 'sink'], reached: false },
    { id: 'mainhall', name: 'Main Hall', targetObjects: ['chair', 'bench', 'person'], reached: false },
    { id: 'exitdoor', name: 'Exit Door', targetObjects: ['person'], reached: false },
  ]);
  const [currentCheckpoint, setCurrentCheckpoint] = useState<string>('');

  useEffect(() => {
    loadModel();
    return () => {
      if (!externalVideoElement) {
        stopCamera();
      }
    };
  }, []);

  // Handle external video element
  useEffect(() => {
    if (externalVideoElement && model) {
      // Use external video element - ensure it's ready
      if (externalVideoElement.readyState >= 2) {
        setUseCamera(true);
      } else {
        externalVideoElement.addEventListener('loadeddata', () => {
          setUseCamera(true);
        }, { once: true });
      }
    }
  }, [externalVideoElement, model]);

  useEffect(() => {
    if (useCamera && model) {
      detectObjects();
    }
  }, [useCamera, model, externalVideoElement]);

  const loadModel = async () => {
    try {
      setIsLoading(true);
      const loadedModel = await cocoSsd.load();
      setModel(loadedModel);
      setIsLoading(false);
    } catch (err) {
      setError('Failed to load model: ' + (err as Error).message);
      setIsLoading(false);
    }
  };

  const speakText = async (text: string) => {
    if (isSpeaking) return;
    
    try {
      setIsSpeaking(true);
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error('Speech failed');

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (err) {
      console.error('TTS Error:', err);
      setIsSpeaking(false);
    }
  };

  const checkForCheckpoints = (predictions: cocoSsd.DetectedObject[]) => {
    // Normalize detected class names (lowercase for comparison)
    const detectedClasses = predictions.map(p => p.class.toLowerCase().trim());
    
    // Class name mappings for COCO-SSD variations
    const classMappings: Record<string, string[]> = {
      'tv': ['tv', 'television'],
      'remote': ['remote', 'remote control'],
      'cell phone': ['cell phone', 'mobile phone', 'phone'],
      'mouse': ['mouse', 'computer mouse'],
      'toilet': ['toilet'],
      'sink': ['sink'],
      'chair': ['chair'],
      'bench': ['bench'],
      'person': ['person'],
    };

    // Use functional update to access current state and avoid stale closures
    setCheckpoints(prev => {
      const newCheckpoints = prev.map(checkpoint => {
        // Skip if already reached
        if (checkpoint.reached) return checkpoint;
        
        const hasRequiredObjects = checkpoint.targetObjects.some(targetObj => {
          const normalizedTarget = targetObj.toLowerCase().trim();
          
          // Direct match
          if (detectedClasses.includes(normalizedTarget)) {
            return true;
          }
          
          // Check class mappings
          const variations = classMappings[normalizedTarget] || [normalizedTarget];
          return variations.some(variation => detectedClasses.includes(variation));
        });
        
        if (hasRequiredObjects) {
          const reachedCheckpoint = { ...checkpoint, reached: true };
          
          // Handle side effects after state update
          Promise.resolve().then(() => {
            setCurrentCheckpoint(reachedCheckpoint.name);
            speakText(`Checkpoint reached: ${reachedCheckpoint.name}`);
          });
          
          console.log(`✅ Checkpoint reached: ${reachedCheckpoint.name}`, {
            detected: detectedClasses,
            required: checkpoint.targetObjects,
            allDetections: predictions.map(p => `${p.class} (${(p.score * 100).toFixed(1)}%)`)
          });
          
          return reachedCheckpoint;
        }
        
        return checkpoint;
      });
      
      return newCheckpoints;
    });
  };

  const checkProximityAlerts = (predictions: cocoSsd.DetectedObject[]) => {
    const now = Date.now();
    // Only alert every 3 seconds to avoid spam
    if (now - lastProximityAlertRef.current < 3000) return;

    const veryCloseObjects = predictions.filter(p => {
      const distance = estimateDistance(p);
      return distance === 'Very Close';
    });

    if (veryCloseObjects.length > 0) {
      lastProximityAlertRef.current = now;
      const objectNames = veryCloseObjects.map(o => o.class).join(', ');
      speakText(`Warning! Objects very close: ${objectNames}`);
    }
  };

  const announceDetections = async (predictions: cocoSsd.DetectedObject[]) => {
    if (predictions.length === 0 || isSpeaking) return;

    // Group objects by distance
    const objectsByDistance: { [key: string]: string[] } = {
      'Very Close': [],
      'Close': [],
      'Medium': [],
      'Far': [],
      'Very Far': []
    };

    predictions.forEach((pred) => {
      const distance = estimateDistance(pred);
      if (!objectsByDistance[distance].includes(pred.class)) {
        objectsByDistance[distance].push(pred.class);
      }
    });

    // Generate Text
    let announcement = '';
    const distances = ['Very Close', 'Close', 'Medium', 'Far', 'Very Far'];
    for (const dist of distances) {
      if (objectsByDistance[dist].length > 0) {
        announcement += `${dist}: ${objectsByDistance[dist].join(', ')}. `;
      }
    }

    // Guard: Don't repeat identical scenes
    if (announcement === lastAnnouncementRef.current) return;
    lastAnnouncementRef.current = announcement;

    await speakText(announcement);
  };

  const testAudio = async () => {
    await speakText("Audio system is active.");
  };

  const detectObjects = async () => {
    if (!model || !useCamera) return;
    setIsDetecting(true);
    
    const detect = async () => {
      const videoEl = externalVideoElement || videoRef.current;
      if (!useCamera || !videoEl) return;
      
      try {
        const predictions = await model.detect(videoEl as HTMLVideoElement);
        const filtered = predictions.filter(p => p.score > 0.6);
        setDetections(filtered);
        
        // Debug: Log detected classes occasionally
        if (filtered.length > 0 && Math.random() < 0.01) {
          console.log('Detected objects:', filtered.map(p => p.class));
        }
        
        // Check for checkpoints
        checkForCheckpoints(filtered);
        
        // Check for proximity alerts
        checkProximityAlerts(filtered);
        
        const now = Date.now();
        if (now - lastAnnouncementTimeRef.current > 5000 && !isSpeaking && filtered.length > 0) {
          lastAnnouncementTimeRef.current = now;
          announceDetections(filtered);
        }
        
        if (canvasRef.current && videoEl) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          
          canvas.width = videoEl.videoWidth || 1280;
          canvas.height = videoEl.videoHeight || 720;
          
          if (ctx) {
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            drawBoundingBoxes(filtered, canvas);
          }
        }
        
        requestAnimationFrame(detect);
      } catch (err) {
        console.error('Detection loop error:', err);
      }
    };
    detect();
  };

  const estimateDistance = (prediction: cocoSsd.DetectedObject): string => {
    const [x, y, width, height] = prediction.bbox;
    const boxArea = width * height;
    const canvasArea = (canvasRef.current?.width || 1280) * (canvasRef.current?.height || 720);
    const screenPercentage = (boxArea / canvasArea) * 100;
    
    const isLarge = ['person', 'car', 'bicycle', 'tv', 'couch'].includes(prediction.class);
    const isSmall = ['bottle', 'cup', 'cell phone', 'mouse', 'remote'].includes(prediction.class);
    
    let thresholds = { vClose: 25, close: 10, med: 3 };
    if (isSmall) thresholds = { vClose: 8, close: 3, med: 1 };
    if (isLarge) thresholds = { vClose: 40, close: 20, med: 8 };

    if (screenPercentage > thresholds.vClose) return 'Very Close';
    if (screenPercentage > thresholds.close) return 'Close';
    if (screenPercentage > thresholds.med) return 'Medium';
    return screenPercentage > 0.5 ? 'Far' : 'Very Far';
  };

  const drawBoundingBoxes = (predictions: cocoSsd.DetectedObject[], canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    predictions.forEach(prediction => {
      const [x, y, width, height] = prediction.bbox;
      const distance = estimateDistance(prediction);
      
      // Color code by distance
      const colorMap: { [key: string]: string } = {
        'Very Close': '#FF0000',
        'Close': '#FF9900',
        'Medium': '#FFFF00',
        'Far': '#00FF00',
        'Very Far': '#00FFFF'
      };
      
      ctx.strokeStyle = colorMap[distance] || '#00FF00';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);
      
      ctx.fillStyle = colorMap[distance] || '#00FF00';
      ctx.font = 'bold 16px Arial';
      const label = `${prediction.class} (${Math.round(prediction.score * 100)}%)`;
      const distLabel = `Dist: ${distance}`;
      
      const bgWidth = Math.max(ctx.measureText(label).width, ctx.measureText(distLabel).width) + 10;
      ctx.fillRect(x, y - 45, bgWidth, 45);
      
      ctx.fillStyle = '#000000';
      ctx.fillText(label, x + 5, y - 28);
      ctx.fillText(distLabel, x + 5, y - 10);
    });
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setUseCamera(true);
        };
      }
    } catch (err) {
      setError('Camera access denied');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setUseCamera(false);
    setIsDetecting(false);
  };

  const resetCheckpoints = () => {
    setCheckpoints(prev => prev.map(cp => ({ ...cp, reached: false })));
    setCurrentCheckpoint('');
  };

  if (!showUI) {
    // Hidden mode - just render canvas overlay
    return (
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1000 }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white font-sans">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-3xl font-bold mb-4">PathPilot Vision Assistant</h1>
        
        {error && <div className="bg-red-900 border border-red-500 p-3 mb-4 rounded">{error}</div>}

        <div className="flex justify-center gap-4 mb-8">
          {!externalVideoElement && (
            <>
              {!useCamera ? (
                <button onClick={startCamera} className="bg-green-600 px-6 py-2 rounded flex items-center gap-2 hover:bg-green-500">
                  <Camera size={20}/> Start Camera
                </button>
              ) : (
                <button onClick={stopCamera} className="bg-red-600 px-6 py-2 rounded flex items-center gap-2 hover:bg-red-500">
                  <Square size={20}/> Stop Camera
                </button>
              )}
            </>
          )}
          <button onClick={testAudio} disabled={isSpeaking} className="bg-purple-600 px-6 py-2 rounded disabled:opacity-50">
            {isSpeaking ? '🔊 Speaking...' : '🔊 Test Audio'}
          </button>
          <button onClick={resetCheckpoints} className="bg-blue-600 px-6 py-2 rounded flex items-center gap-2 hover:bg-blue-500">
            <MapPin size={20}/> Reset Checkpoints
          </button>
        </div>

        {/* Checkpoint Status */}
        <div className="mb-6 bg-gray-800 p-4 rounded-lg">
          <h2 className="text-xl font-bold mb-3 flex items-center justify-center gap-2">
            <MapPin size={24}/> Navigation Checkpoints
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {checkpoints.map((cp) => (
              <div 
                key={cp.id} 
                className={`p-3 rounded-lg border-2 transition-all ${
                  cp.reached 
                    ? 'bg-green-900 border-green-500' 
                    : 'bg-gray-700 border-gray-500'
                }`}
              >
                <p className="font-bold">{cp.name}</p>
                <p className="text-xs text-gray-300">
                  {cp.targetObjects.join(', ')}
                </p>
                <p className="text-sm mt-2">
                  {cp.reached ? '✅ Reached' : '⏳ Pending'}
                </p>
              </div>
            ))}
          </div>
          {currentCheckpoint && (
            <div className="mt-4 bg-green-800 p-3 rounded-lg animate-pulse">
              <p className="font-bold">🎯 Current: {currentCheckpoint}</p>
            </div>
          )}
        </div>

        <div className="relative bg-black rounded-xl overflow-hidden aspect-video border-4 border-gray-700">
          {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/50">Loading Model...</div>}
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover hidden" playsInline />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />
        </div>

        {detections.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-bold mb-3">Detected Objects</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {detections.map((d, i) => {
                const distance = estimateDistance(d);
                const colorClass = distance === 'Very Close' ? 'border-red-500' :
                                 distance === 'Close' ? 'border-orange-500' :
                                 distance === 'Medium' ? 'border-yellow-500' :
                                 'border-green-500';
                
                return (
                  <div key={i} className={`bg-gray-800 p-3 rounded-lg border-l-4 ${colorClass}`}>
                    <p className="font-bold capitalize">{d.class}</p>
                    <p className="text-sm text-gray-400">{distance}</p>
                    {distance === 'Very Close' && (
                      <p className="text-xs text-red-400 mt-1">⚠️ Warning!</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ObjectDetection;