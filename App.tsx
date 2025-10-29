
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import type { LiveSession } from './types';
import { createBlob } from './utils/audio';
import { MicIcon, StopIcon } from './components/icons';

const App: React.FC = () => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [language, setLanguage] = useState<'en-US' | 'th-TH'>('en-US');
  const [transcriptHistory, setTranscriptHistory] = useState<string[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState<string>('');

  const sessionRef = useRef<LiveSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  const stopRecording = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsRecording(false);
    setIsConnecting(false);
    setCurrentTranscript(prev => {
        if(prev.trim()) {
            setTranscriptHistory(history => [...history, prev.trim()]);
        }
        return '';
    });
  }, []);

  const startRecording = useCallback(async () => {
    setIsConnecting(true);
    setCurrentTranscript('');
    setTranscriptHistory([]);
    try {
      if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const context = new ((window as any).AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = context;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const languageName = language === 'en-US' ? 'English' : 'Thai';
      const systemInstruction = `You are a world-class transcription service. The user will speak in ${languageName}. Transcribe their speech accurately in real-time. Do not break up the transcription based on pauses; provide a single, continuous transcript.`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            const source = context.createMediaStreamSource(stream);
            const scriptProcessor = context.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(context.destination);
            
            setIsConnecting(false);
            setIsRecording(true);
          },
          onmessage: (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              // Append text as it arrives for a continuous transcript.
              setCurrentTranscript(prev => prev + text);
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error('API Error:', e);
            alert(`An API error occurred: ${e.message}. Please try again.`);
            stopRecording();
          },
          onclose: () => {
            stopRecording();
          },
        },
        config: {
          inputAudioTranscription: {},
          responseModalities: [Modality.AUDIO], // Required but we won't process audio output
          systemInstruction,
        },
      });
      sessionRef.current = await sessionPromise;
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Could not start recording. Please ensure you have given microphone permissions and have a valid API key.');
      stopRecording();
    }
  }, [language, stopRecording]);

  const handleToggleRecording = () => {
    if (isRecording || isConnecting) {
      stopRecording();
    } else {
      startRecording();
    }
  };
  
  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return (
    <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center p-4 font-sans">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-6 md:p-8 w-full max-w-2xl flex flex-col" style={{minHeight: '600px'}}>
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-cyan-400">Gemini Transcriber</h1>
          <div className="relative">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en-US' | 'th-TH')}
              disabled={isRecording || isConnecting}
              className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block w-full p-2.5 appearance-none disabled:opacity-50"
            >
              <option value="en-US">English</option>
              <option value="th-TH">ภาษาไทย (Thai)</option>
            </select>
          </div>
        </header>

        <main className="flex-grow bg-gray-900/50 rounded-lg p-4 overflow-y-auto mb-6 min-h-[300px] flex">
          {transcriptHistory.length === 0 && !currentTranscript && !isRecording && !isConnecting ? (
             <div className="m-auto text-center text-gray-500">
                <p>Click the record button to start.</p>
             </div>
          ) : (
            <p className="text-gray-300 whitespace-pre-wrap break-words w-full">
              {transcriptHistory.join(' ')}
              {transcriptHistory.length > 0 && currentTranscript ? ' ' : ''}
              <span className="text-white font-medium">{currentTranscript}</span>
              {isRecording && <span className="animate-pulse text-white">|</span>}
            </p>
          )}
        </main>
        
        <footer className="flex flex-col items-center justify-center">
          <button
            onClick={handleToggleRecording}
            disabled={isConnecting}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50
              ${isRecording ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-cyan-500 hover:bg-cyan-600 focus:ring-cyan-400'}
            `}
          >
            {isRecording ? <StopIcon /> : <MicIcon />}
          </button>
           <p className="mt-4 text-sm text-gray-400 h-5">
            {isConnecting ? 'Connecting...' : isRecording ? 'Listening...' : 'Ready to record'}
          </p>
        </footer>
      </div>
       <p className="text-gray-600 text-xs mt-4">Powered by Google Gemini</p>
    </div>
  );
};

export default App;
