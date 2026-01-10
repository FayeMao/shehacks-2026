'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Camera, Upload, Square } from 'lucide-react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

const ObjectDetection = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Refs for throttling and state tracking
  const lastAnnouncementRef = useRef<string>('');
  const lastAnnouncementTimeRef = useRef<number>(0);
  
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detections, setDetections] = useState<cocoSsd.DetectedObject[]>([]);
  const [useCamera, setUseCamera] = useState(false);
  const [error, setError] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    loadModel();
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (useCamera && model && videoRef.current) {
      detectObjects();
    }
  }, [useCamera, model]);

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

    try {
      setIsSpeaking(true);
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: announcement }),
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

  const testAudio = async () => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: "Audio system is active." }),
      });
      if (!response.ok) throw new Error('Proxy error');
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      await audio.play();
    } catch (err) {
      setError("Audio test failed. Check server logs.");
      setIsSpeaking(false);
    }
  };

  const detectObjects = async () => {
    if (!model || !videoRef.current || !useCamera) return;
    setIsDetecting(true);
    
    const detect = async () => {
      if (!useCamera || !videoRef.current) return;
      
      try {
        const predictions = await model.detect(videoRef.current);
        const filtered = predictions.filter(p => p.score > 0.6);
        setDetections(filtered);
        
        const now = Date.now();
        if (now - lastAnnouncementTimeRef.current > 5000 && !isSpeaking && filtered.length > 0) {
          lastAnnouncementTimeRef.current = now;
          announceDetections(filtered);
        }
        
        if (canvasRef.current && videoRef.current) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          
          // Match canvas size to the actual video stream resolution
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          
          if (ctx) {
            // 1. DRAW THE VIDEO FRAME FIRST (This fixes the black screen)
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            
            // 2. DRAW THE BOXES ON TOP
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
    
    const isLarge = ['person', 'car', 'bicycle', 'tv'].includes(prediction.class);
    const isSmall = ['bottle', 'cup', 'cell phone', 'mouse'].includes(prediction.class);
    
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
      
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);
      
      ctx.fillStyle = '#00FF00';
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

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white font-sans">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-3xl font-bold mb-4">Vision AI Assistant</h1>
        
        {error && <div className="bg-red-900 border border-red-500 p-3 mb-4 rounded">{error}</div>}

        <div className="flex justify-center gap-4 mb-8">
          {!useCamera ? (
            <button onClick={startCamera} className="bg-green-600 px-6 py-2 rounded flex items-center gap-2 hover:bg-green-500">
              <Camera size={20}/> Start Camera
            </button>
          ) : (
            <button onClick={stopCamera} className="bg-red-600 px-6 py-2 rounded flex items-center gap-2 hover:bg-red-500">
              <Square size={20}/> Stop Camera
            </button>
          )}
          <button onClick={testAudio} disabled={isSpeaking} className="bg-purple-600 px-6 py-2 rounded disabled:opacity-50">
            {isSpeaking ? '🔊 Speaking...' : '🔊 Test Audio'}
          </button>
        </div>

        <div className="relative bg-black rounded-xl overflow-hidden aspect-video border-4 border-gray-700">
          {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/50">Loading Model...</div>}
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover hidden" playsInline />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />
        </div>

        {detections.length > 0 && (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {detections.map((d, i) => (
              <div key={i} className="bg-gray-800 p-3 rounded-lg border-l-4 border-green-500">
                <p className="font-bold capitalize">{d.class}</p>
                <p className="text-sm text-gray-400">{estimateDistance(d)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ObjectDetection;