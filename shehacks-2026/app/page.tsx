import ObjectDetection from './components/ObjectDetection';
import VoiceController from './components/VoiceContoller';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-50">
      <h1 className="text-4xl font-bold mb-8 text-blue-700">GuideMate System</h1>
      
      {/* Container for the Vision part */}
      <div className="w-full max-w-2xl mb-12 p-4 bg-white rounded-xl shadow-lg">
        <h2 className="text-xl font-semibold mb-4">Vision Feed</h2>
        <ObjectDetection />
      </div>

      {/* Container for the Voice part */}
      <div className="w-full max-w-md p-4 bg-white rounded-xl shadow-lg text-center">
        <h2 className="text-xl font-semibold mb-4">Voice Commands</h2>
        <VoiceController />
      </div>
    </main>
  );
}