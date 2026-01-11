"use client";

import { useState, useEffect, useRef } from "react";

// This tells the app that SpeechRecognition exists in the browser
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface Checkpoint {
  id: string;
  name: string;
}

const checkpoints: Checkpoint[] = [
  { id: 'washroom', name: 'Washroom' },
  { id: 'elevator', name: 'Elevator' },
  { id: 'mainhall', name: 'Main Hall' },
  { id: 'exitdoor', name: 'Exit Door' },
];

const VoiceController = () => {
  const [isListening, setIsListening] = useState(false);
  const [matchedCheckpoint, setMatchedCheckpoint] = useState<string | null>(null);
  const [status, setStatus] = useState('Click to start listening for checkpoints');
  const recognitionRef = useRef<any>(null);

  // Text-to-speech function using browser's built-in SpeechSynthesis
  const speakText = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn('SpeechSynthesis not supported');
      return;
    }

    try {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
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
  };

  // Start continuous speech recognition
  const startListening = () => {
    if (typeof window === "undefined") return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech Recognition is not supported in this browser. Try Chrome!");
      setStatus('Speech Recognition not supported');
      return;
    }

    let shouldStop = false;

    const startRecognition = () => {
      if (shouldStop) return;

      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        setStatus('Listening for checkpoint keywords...');
        console.log("Listening started...");
      };

      recognition.onend = () => {
        setIsListening(false);
        console.log("Listening ended.");
        if (!shouldStop) {
          // Automatically restart recognition
          setTimeout(() => {
            if (!shouldStop) {
              try {
                startRecognition();
              } catch (e) {
                console.error('Error restarting recognition:', e);
              }
            }
          }, 100);
        }
      };

      recognition.onresult = (event: any) => {
        const rawTranscript = event.results[event.results.length - 1][0].transcript;
        const transcript = rawTranscript.toLowerCase().trim();
        
        // Debug: Print speech-to-text results
        console.log('🎤 Speech-to-Text [VoiceController]:', {
          raw: rawTranscript,
          processed: transcript,
          confidence: event.results[event.results.length - 1][0].confidence,
        });

        // Keyword mapping - same as navigation component
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

        // Find matching checkpoint
        let matchedId: string | null = null;
        for (const [keyword, checkpointId] of Object.entries(keywordMap)) {
          if (transcript.includes(keyword)) {
            matchedId = checkpointId;
            console.log(`✅ Keyword matched: "${keyword}" → ${checkpointId}`);
            break;
          }
        }

        if (matchedId) {
          const checkpoint = checkpoints.find(cp => cp.id === matchedId);
          if (checkpoint) {
            console.log(`🎯 Checkpoint matched: ${checkpoint.name}`);
            setMatchedCheckpoint(checkpoint.name);
            setStatus(`Checkpoint detected: ${checkpoint.name}`);
            speakText(`Checkpoint detected: ${checkpoint.name}`);
          }
        } else {
          console.log('❌ No checkpoint matched for:', transcript);
          setStatus(`Heard: "${transcript}" - No checkpoint matched`);
        }
      };

      recognition.onerror = (err: any) => {
        console.error('Speech Recognition Error:', err.error);
        
        if (err.error === 'not-allowed') {
          setStatus('Microphone permission denied. Please enable microphone access.');
          setIsListening(false);
          shouldStop = true;
        } else if (err.error !== 'aborted' && err.error !== 'no-speech') {
          setIsListening(false);
          if (!shouldStop) {
            setTimeout(() => {
              if (!shouldStop) {
                try {
                  startRecognition();
                } catch (e) {
                  console.error('Error restarting after error:', e);
                }
              }
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
        setStatus('Error starting speech recognition');
      }
    };

    startRecognition();

    // Cleanup function to stop recognition
    return () => {
      shouldStop = true;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore errors when stopping
        }
      }
      setIsListening(false);
    };
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore errors when stopping
      }
    }
    setIsListening(false);
    setStatus('Stopped listening');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore errors
        }
      }
      // Cancel any ongoing speech synthesis
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return (
    <div className="p-4 border rounded-lg shadow-sm">
      <button 
        onClick={isListening ? stopListening : startListening}
        className={`px-4 py-2 rounded font-bold text-white mb-4 ${
          isListening ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'
        }`}
      >
        {isListening ? "🎤 Stop Listening" : "🎤 Start Listening"}
      </button>

      <div className="mt-4 space-y-2">
        <div className="text-sm text-gray-600">
          <strong>Status:</strong> {status}
        </div>

        {matchedCheckpoint && (
          <div className="mt-3 p-3 bg-blue-100 border border-blue-300 rounded-lg">
            <div className="text-sm font-semibold text-blue-800">
              Last Matched Checkpoint:
            </div>
            <div className="text-lg font-bold text-blue-900 mt-1">
              {matchedCheckpoint}
            </div>
          </div>
        )}

        <div className="mt-4 text-xs text-gray-500">
          <div className="font-semibold mb-1">Available checkpoints:</div>
          <div className="flex flex-wrap gap-2">
            {checkpoints.map((cp) => (
              <span key={cp.id} className="px-2 py-1 bg-gray-100 rounded">
                {cp.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceController;