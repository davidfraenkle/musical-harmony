import React, { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';
import { Play, Square, RotateCcw, Clock, Music, Volume2, HelpCircle, CheckCircle2, AlertCircle } from 'lucide-react';

/* MUSIC THEORY CONSTANTS & UTILS
*/
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OCTAVES = 2;
const START_OCTAVE = 3; // Starts at C3
const TOTAL_NOTES = 12 * OCTAVES + 1; // C3 to C5
const BARS = 4;
const STEPS_PER_BAR = 1; // Simplified: 1 chord per bar
const TOTAL_STEPS = BARS * STEPS_PER_BAR;
const DEFAULT_TEMPO = 100; // BPM
const ACTIVITY_TIME = 20 * 60; // 20 minutes in seconds

// Audio Context Singleton
let audioCtx = null;

const getFrequency = (noteIndex) => {
  // MIDI note 48 is C3. 
  // Formula: f = 440 * 2^((d-69)/12) where d is midi number
  const midiNumber = 48 + noteIndex; 
  return 440 * Math.pow(2, (midiNumber - 69) / 12);
};

// Simple Synth Voice
const playTone = (freq, duration, type = 'triangle', volume = 0.1) => {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  
  gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
  gainNode.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + 0.05);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
};

// Chord Identification Logic
const identifyChord = (activeIndices) => {
  if (activeIndices.length < 3) return null;

  // Normalize notes to 0-11 (Pitch Classes)
  const pcs = activeIndices.map(idx => (idx % 12)).sort((a, b) => a - b);
  // Remove duplicates
  const uniquePcs = [...new Set(pcs)];
  
  if (uniquePcs.length < 3) return "Unknown";

  // Brute force check for Triads (Major/Minor)
  // Root position checks
  for (let root = 0; root < 12; root++) {
    const major = [root, (root + 4) % 12, (root + 7) % 12].sort((a,b)=>a-b);
    const minor = [root, (root + 3) % 12, (root + 7) % 12].sort((a,b)=>a-b);
    
    // Check if uniquePcs match these sets (ignoring inversions for simple naming)
    const isMajor = major.every(n => uniquePcs.includes(n)) && uniquePcs.every(n => major.includes(n));
    const isMinor = minor.every(n => uniquePcs.includes(n)) && uniquePcs.every(n => minor.includes(n));

    if (isMajor) return `${NOTE_NAMES[root]} Major`;
    if (isMinor) return `${NOTE_NAMES[root]} Minor`;
  }

  return "Complex/Inversion";
};

export default function HarmonySolver() {
  // State
  const [grid, setGrid] = useState(Array(TOTAL_STEPS).fill().map(() => new Set()));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBar, setCurrentBar] = useState(-1);
  const [timeLeft, setTimeLeft] = useState(ACTIVITY_TIME);
  const [timerActive, setTimerActive] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [analysis, setAnalysis] = useState(Array(BARS).fill(null));
  
  const timerRef = useRef(null);
  const playbackRef = useRef(null);

  // Initialize Audio Context on first interaction
  const initAudio = () => {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  };

  // Timer Logic
  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsPlaying(false);
      setTimerActive(false);
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [timerActive, timeLeft]);

  // Playback Loop Logic
  useEffect(() => {
    if (isPlaying) {
      let step = 0;
      const stepTime = (60 / DEFAULT_TEMPO) * 4 * 1000; // 4 beats per bar, ms

      const playStep = () => {
        setCurrentBar(step);
        
        // Play notes in this column
        const activeNotes = Array.from(grid[step]);
        activeNotes.forEach(noteIndex => {
          playTone(getFrequency(noteIndex), 2.5, 'triangle', 0.15); // Long sustain
        });

        step = (step + 1) % BARS;
      };

      playStep(); // Play immediately
      playbackRef.current = setInterval(playStep, stepTime);
    } else {
      clearInterval(playbackRef.current);
      setCurrentBar(-1);
    }
    return () => clearInterval(playbackRef.current);
  }, [isPlaying, grid]);

  // Grid Interaction
  const toggleNote = (barIndex, noteIndex) => {
    initAudio();
    
    // Play short preview tone
    playTone(getFrequency(noteIndex), 0.3, 'sine', 0.1);

    setGrid(prevGrid => {
      const newGrid = [...prevGrid];
      const newSet = new Set(newGrid[barIndex]);
      if (newSet.has(noteIndex)) {
        newSet.delete(noteIndex);
      } else {
        newSet.add(noteIndex);
      }
      newGrid[barIndex] = newSet;
      
      // Update Analysis immediately
      const currentNotes = Array.from(newSet);
      const chordName = identifyChord(currentNotes);
      setAnalysis(prev => {
        const newAnalysis = [...prev];
        newAnalysis[barIndex] = chordName;
        return newAnalysis;
      });

      return newGrid;
    });

    if (!timerActive && timeLeft > 0) setTimerActive(true);
  };

  const clearGrid = () => {
    setGrid(Array(TOTAL_STEPS).fill().map(() => new Set()));
    setAnalysis(Array(BARS).fill(null));
    setIsPlaying(false);
    setCurrentBar(-1);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Generate rows for the grid (Reversed to have high notes at top)
  const rows = [];
  for (let i = 0; i < TOTAL_NOTES; i++) {
    rows.push(i);
  }
  rows.reverse();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-cyan-500 selection:text-white">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 p-4 sticky top-0 z-50 shadow-lg">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-600 rounded-lg flex items-center justify-center shadow-cyan-500/50 shadow-md">
              <Music className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-400">
                Harmonic Solver
              </h1>
              <p className="text-xs text-slate-400">4-Bar Chord Construction</p>
            </div>
          </div>

          <div className="flex items-center gap-6 bg-slate-900/50 p-2 rounded-xl border border-slate-700">
            <div className={`flex items-center gap-2 font-mono text-2xl ${timeLeft < 60 ? 'text-red-400 animate-pulse' : 'text-cyan-400'}`}>
              <Clock className="w-5 h-5" />
              {formatTime(timeLeft)}
            </div>
            
            <div className="h-8 w-px bg-slate-700 mx-2"></div>

            <button 
              onClick={() => { initAudio(); setIsPlaying(!isPlaying); if(!timerActive && timeLeft > 0) setTimerActive(true); }}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold transition-all transform hover:scale-105 ${
                isPlaying 
                ? 'bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/20' 
                : 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20'
              }`}
            >
              {isPlaying ? <><Square className="w-4 h-4 fill-current" /> Stop</> : <><Play className="w-4 h-4 fill-current" /> Play Loop</>}
            </button>

            <button 
              onClick={clearGrid}
              className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors tooltip"
              title="Reset Grid"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            <button 
              onClick={() => setShowHelp(!showHelp)}
              className={`p-2 rounded-lg transition-colors ${showHelp ? 'bg-cyan-900/50 text-cyan-400' : 'hover:bg-slate-700 text-slate-400'}`}
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="max-w-6xl mx-auto p-4 md:p-8">
        
        {/* Help Banner */}
        {showHelp && (
          <div className="mb-8 bg-slate-800/80 backdrop-blur border border-cyan-500/30 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500"></div>
            <h2 className="text-lg font-semibold text-cyan-400 mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" /> Activity Brief
            </h2>
            <p className="text-slate-300 leading-relaxed max-w-3xl">
              Construct a 4-chord progression to create a harmonic loop. 
              Click the grid cells to place notes. 
              <span className="block mt-2 text-slate-400 text-sm">
                • Try to build a <strong>Major</strong> (Root, +4, +7) or <strong>Minor</strong> (Root, +3, +7) triad in each bar.<br/>
                • The music will loop automatically. You have 20 minutes to experiment.
              </span>
            </p>
            <button 
              onClick={() => setShowHelp(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white"
            >
              ×
            </button>
          </div>
        )}

        {/* The Sequencer Grid */}
        <div className="bg-slate-800 rounded-xl shadow-2xl overflow-hidden border border-slate-700 flex flex-col md:flex-row">
          
          {/* Piano Keys (Left Column) */}
          <div className="w-24 md:w-32 flex-shrink-0 bg-slate-900 border-r border-slate-700 z-10 shadow-lg">
             <div className="h-12 bg-slate-900 border-b border-slate-700 flex items-center justify-center text-xs text-slate-500 font-bold tracking-wider">
               KEYS
             </div>
             {rows.map((noteIndex) => {
               const name = NOTE_NAMES[noteIndex % 12];
               const octave = Math.floor(noteIndex / 12) + START_OCTAVE;
               const isBlackKey = name.includes('#');
               return (
                 <div 
                   key={`key-${noteIndex}`}
                   className={`h-10 flex items-center justify-end pr-2 text-xs border-b border-slate-800 transition-colors cursor-pointer
                     ${isBlackKey 
                       ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' 
                       : 'bg-slate-200 text-slate-900 font-bold hover:bg-white'}
                   `}
                   onClick={() => { initAudio(); playTone(getFrequency(noteIndex), 0.5, 'sine'); }}
                 >
                   <span className="opacity-70">{name}{octave}</span>
                 </div>
               );
             })}
          </div>

          {/* Grid Area */}
          <div className="flex-1 overflow-x-auto">
            {/* Bar Headers / Chord Status */}
            <div className="flex h-12 bg-slate-900 sticky top-0 z-10 border-b border-slate-700">
              {Array(BARS).fill(0).map((_, barIndex) => {
                 const chord = analysis[barIndex];
                 const isGood = chord && (chord.includes('Major') || chord.includes('Minor'));
                 
                 return (
                  <div 
                    key={`header-${barIndex}`} 
                    className={`flex-1 min-w-[120px] flex items-center justify-center border-r border-slate-700 transition-colors
                      ${currentBar === barIndex ? 'bg-slate-700/50' : ''}
                    `}
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Bar {barIndex + 1}</span>
                      <div className={`text-sm font-mono h-5 ${isGood ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>
                        {chord || "—"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Note Grid */}
            <div className="relative">
              {rows.map((noteIndex) => {
                const isBlackKey = NOTE_NAMES[noteIndex % 12].includes('#');
                
                return (
                  <div key={`row-${noteIndex}`} className="flex h-10">
                    {Array(BARS).fill(0).map((_, barIndex) => {
                      const isActive = grid[barIndex].has(noteIndex);
                      const isPlayingBar = currentBar === barIndex;
                      
                      return (
                        <div 
                          key={`cell-${barIndex}-${noteIndex}`}
                          className={`
                            flex-1 min-w-[120px] border-r border-b border-slate-700/50 relative cursor-pointer transition-all duration-100
                            ${isBlackKey ? 'bg-slate-800/30' : 'bg-slate-800/10'}
                            ${isPlayingBar ? 'bg-white/5' : ''}
                            hover:bg-white/10
                          `}
                          onClick={() => toggleNote(barIndex, noteIndex)}
                        >
                          {/* Note Block */}
                          <div 
                            className={`
                              absolute inset-1 rounded-md shadow-sm transform transition-all duration-200
                              ${isActive 
                                ? 'scale-100 opacity-100' 
                                : 'scale-50 opacity-0'}
                              ${isPlayingBar && isActive
                                ? 'bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.6)]' 
                                : 'bg-cyan-600'}
                            `}
                          >
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              
              {/* Playhead Overlay (Optional - currently using column highlighting instead) */}
            </div>
          </div>
        </div>

        {/* Legend / Status Footer */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-400">
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex items-center gap-3">
             <Volume2 className="w-5 h-5 text-emerald-400" />
             <p>Sound is synthesized in-browser.</p>
          </div>
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex items-center gap-3">
             <AlertCircle className="w-5 h-5 text-amber-400" />
             <p>Use chords C, G, Am, F for a classic progression.</p>
          </div>
           <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex items-center gap-3">
             <Clock className="w-5 h-5 text-rose-400" />
             <p>Activity ends automatically in 20 minutes.</p>
          </div>
        </div>

      </main>
      
      {/* Time Up Overlay */}
      {timeLeft === 0 && (
        <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center backdrop-blur-sm">
          <div className="bg-slate-800 p-8 rounded-2xl border border-slate-600 shadow-2xl max-w-md text-center">
            <Clock className="w-16 h-16 text-rose-500 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-white mb-2">Time's Up!</h2>
            <p className="text-slate-400 mb-6">The 20-minute problem solving session has ended.</p>
            <button 
              onClick={() => { setTimeLeft(ACTIVITY_TIME); clearGrid(); }}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-8 rounded-full transition-all"
            >
              Start New Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
