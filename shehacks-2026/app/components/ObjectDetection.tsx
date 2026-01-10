'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Camera, Upload, Square } from 'lucide-react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

const ObjectDetection = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detections, setDetections] = useState<cocoSsd.DetectedObject[]>([]);
  const [useCamera, setUseCamera] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadModel();
    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (useCamera && model && videoRef.current) {
      console.log('useCamera changed to true, starting detection...');
      detectObjects();
    }
  }, [useCamera, model]);

  const loadModel = async () => {
    try {
      console.log('Starting to load COCO-SSD model...');
      setIsLoading(true);
      const loadedModel = await cocoSsd.load();
      console.log('Model loaded successfully:', loadedModel);
      setModel(loadedModel);
      setIsLoading(false);
    } catch (err) {
      console.error('Model loading error:', err);
      setError('Failed to load model: ' + (err as Error).message);
      setIsLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      console.log('Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      console.log('Camera access granted:', stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          console.log('Video metadata loaded');
          videoRef.current?.play();
          setUseCamera(true);
        };
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Failed to access camera: ' + (err as Error).message);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setUseCamera(false);
    setIsDetecting(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          if (canvasRef.current) {
            const canvas = canvasRef.current;
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              detectObjectsInImage(img);
            }
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const detectObjectsInImage = async (img: HTMLImageElement) => {
    if (!model) return;
    
    try {
      const predictions = await model.detect(img);
      setDetections(predictions);
      if (canvasRef.current) {
        drawBoundingBoxes(predictions, canvasRef.current);
      }
    } catch (err) {
      setError('Detection failed: ' + (err as Error).message);
    }
  };

  const detectObjects = async () => {
    if (!model || !videoRef.current || !useCamera) {
      console.log('Detection prerequisites not met:', { 
        hasModel: !!model, 
        hasVideo: !!videoRef.current, 
        useCamera 
      });
      return;
    }
    
    console.log('Starting detection loop...');
    setIsDetecting(true);
    
    const detect = async () => {
      if (!useCamera || !videoRef.current) {
        console.log('Detection stopped');
        return;
      }
      
      try {
        console.log('Running detection...');
        const predictions = await model.detect(videoRef.current);
        console.log('Predictions:', predictions);
        setDetections(predictions);
        
        if (canvasRef.current && videoRef.current) {
          const canvas = canvasRef.current;
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          
          console.log('Canvas dimensions:', canvas.width, canvas.height);
          
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0);
            drawBoundingBoxes(predictions, canvas);
          }
        }
        
        if (useCamera) {
          requestAnimationFrame(detect);
        }
      } catch (err) {
        console.error('Detection error:', err);
      }
    };
    
    detect();
  };

  const estimateDistance = (prediction: cocoSsd.DetectedObject): string => {
    const [x, y, width, height] = prediction.bbox;
    const boxArea = width * height;
    
    // Get canvas dimensions for relative sizing
    const canvasWidth = canvasRef.current?.width || 1920;
    const canvasHeight = canvasRef.current?.height || 1080;
    const canvasArea = canvasWidth * canvasHeight;
    
    // Calculate what percentage of the screen the object takes up
    const screenPercentage = (boxArea / canvasArea) * 100;
    
    // Different thresholds for different object types
    const objectSizes: { [key: string]: 'small' | 'medium' | 'large' } = {
      person: 'large',
      car: 'large',
      bicycle: 'large',
      chair: 'medium',
      'dining table': 'large',
      laptop: 'medium',
      tv: 'large',
      bottle: 'small',
      cup: 'small',
      'cell phone': 'small',
      book: 'small',
      mouse: 'small',
      keyboard: 'medium',
    };
    
    const objectSize = objectSizes[prediction.class] || 'medium';
    
    // Adjust thresholds based on object type
    let veryCloseThreshold = 25;
    let closeThreshold = 10;
    let mediumThreshold = 3;
    
    if (objectSize === 'small') {
      veryCloseThreshold = 8;
      closeThreshold = 3;
      mediumThreshold = 1;
    } else if (objectSize === 'large') {
      veryCloseThreshold = 40;
      closeThreshold = 20;
      mediumThreshold = 8;
    }
    
    // Return distance estimate
    if (screenPercentage > veryCloseThreshold) {
      return 'Very Close';
    } else if (screenPercentage > closeThreshold) {
      return 'Close';
    } else if (screenPercentage > mediumThreshold) {
      return 'Medium';
    } else if (screenPercentage > 0.5) {
      return 'Far';
    } else {
      return 'Very Far';
    }
  };

  const drawBoundingBoxes = (predictions: cocoSsd.DetectedObject[], canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    console.log(`Drawing ${predictions.length} bounding boxes`);
    
    predictions.forEach(prediction => {
      const [x, y, width, height] = prediction.bbox;
      const distance = estimateDistance(prediction);
      
      console.log(`Drawing box for ${prediction.class} at [${x}, ${y}, ${width}, ${height}] - Distance: ${distance}`);
      
      // Draw bounding box
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);
      
      // Draw label with distance
      ctx.fillStyle = '#00FF00';
      ctx.font = '18px Arial';
      const label = `${prediction.class} ${Math.round(prediction.score * 100)}%`;
      const distanceLabel = `Distance: ${distance}`;
      const labelWidth = Math.max(ctx.measureText(label).width, ctx.measureText(distanceLabel).width);
      
      // Draw label background
      ctx.fillRect(x, y - 50, labelWidth + 10, 50);
      
      // Draw text
      ctx.fillStyle = '#000000';
      ctx.fillText(label, x + 5, y - 30);
      ctx.fillText(distanceLabel, x + 5, y - 7);
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Object Detection</h1>
          <p className="text-gray-400">Using TensorFlow.js COCO-SSD Model</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="bg-gray-800 rounded-lg p-12 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Loading COCO-SSD model...</p>
          </div>
        ) : (
          <>
            <div className="flex gap-4 mb-6 justify-center">
              {!useCamera ? (
                <>
                  <button
                    onClick={startCamera}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors"
                  >
                    <Camera size={20} />
                    Start Camera
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors"
                  >
                    <Upload size={20} />
                    Upload Image
                  </button>
                </>
              ) : (
                <button
                  onClick={stopCamera}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg transition-colors"
                >
                  <Square size={20} />
                  Stop Camera
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <div className="relative inline-block">
                <video
                  ref={videoRef}
                  className={`rounded-lg ${useCamera ? 'block' : 'hidden'}`}
                  playsInline
                />
                <canvas
                  ref={canvasRef}
                  className="rounded-lg border-2 border-gray-700"
                />
              </div>
            </div>

            {detections.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                  <Square className="text-green-500" size={24} />
                  Detected Objects ({detections.length})
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {detections.map((det, idx) => (
                    <div key={idx} className="bg-gray-700 rounded-lg p-3">
                      <p className="text-white font-semibold">{det.class}</p>
                      <p className="text-green-400 text-sm">
                        {Math.round(det.score * 100)}% confidence
                      </p>
                      <p className="text-blue-400 text-sm">
                        📏 {estimateDistance(det)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ObjectDetection;