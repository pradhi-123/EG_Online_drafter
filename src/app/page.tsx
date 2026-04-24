"use client";

import React, { useState, useEffect } from 'react';
import { PencilRuler, Compass, Layers, Eye, Code, Zap, Play, FastForward, CheckSquare, Mic, Menu, X } from 'lucide-react';

const rad = (deg: number) => (deg * Math.PI) / 180;
type Point3D = [number, number, number];
type Edge = [number, number];

const rotateY = (pts: Point3D[], angleDeg: number): Point3D[] => {
  const c = Math.cos(rad(angleDeg)), s = Math.sin(rad(angleDeg));
  return pts.map(([x, y, z]) => [x * c + z * s, y, -x * s + z * c]);
};
const rotateZ = (pts: Point3D[], angleDeg: number): Point3D[] => {
  const c = Math.cos(rad(angleDeg)), s = Math.sin(rad(angleDeg));
  return pts.map(([x, y, z]) => [x * c - y * s, x * s + y * c, z]);
};
const translate = (pts: Point3D[], tx: number, ty: number, tz: number): Point3D[] =>
  pts.map(([x, y, z]) => [x + tx, y + ty, z + tz]);
const groundPoints = (pts: Point3D[]): Point3D[] => {
  const minZ = Math.min(...pts.map(p => p[2]));
  return translate(pts, 0, 0, -minZ);
};

const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const convexHull = (points: number[][]) => {
  const sorted = [...points].sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]);
  const lower = [];
  for (let i = 0; i < sorted.length; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) < 0) lower.pop();
    lower.push(sorted[i]);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) < 0) upper.pop();
    upper.push(sorted[i]);
  }
  lower.pop();
  upper.pop();
  return new Set(lower.concat(upper).map(p => p[2]));
};

const generateShape = (type: string, side: number, height: number, restsOnCorner: boolean) => {
  const pts: Point3D[] = [];
  const edges: Edge[] = [];
  const labels: string[] = [];
  const typeLow = type.toLowerCase();

  const addPolygon = (z: number, n: number, r: number, startAngle = 0, isTop = false) => {
    const start = pts.length;
    for (let i = 0; i < n; i++) {
      const a = startAngle + (i * 2 * Math.PI) / n;
      pts.push([r * Math.cos(a), r * Math.sin(a), z]);

      let label = '';
      if (n <= 10) {
        label = String.fromCharCode(97 + i) + (isTop ? '1' : '');
      } else {
        // Cone/Cyl: sample every 3rd point (3*24/8 = 3) Wait, n=24. 24/8 = 3
        if (i % 3 === 0) label = String.fromCharCode(97 + i / 3) + (isTop ? '1' : '');
      }
      labels.push(label);
    }
    for (let i = 0; i < n; i++) edges.push([start + i, start + ((i + 1) % n)]);
    return start;
  };

  let n = 4;
  if (typeLow.includes('hex')) n = 6;
  if (typeLow.includes('pent')) n = 5;
  if (typeLow.includes('cone') || typeLow.includes('cylinder')) n = 24;

  let startA = 0;
  if (n === 4) startA = restsOnCorner ? 0 : Math.PI / 4;
  if (n === 5) startA = restsOnCorner ? -Math.PI / 10 : Math.PI / 10;
  if (n === 6) startA = restsOnCorner ? Math.PI / 6 : 0;

  const r = side;
  let axisPts: number[] = [];

  if (typeLow.includes('pyramid') || typeLow.includes('cone')) {
    const b = addPolygon(0, n, r, startA);
    pts.push([0, 0, height]); labels.push('o');
    const apex = pts.length - 1;
    for (let i = 0; i < n; i += (n > 10 ? 3 : 1)) edges.push([b + i, apex]);

    pts.push([0, 0, 0]); labels.push('o1'); // Center base
    axisPts = [pts.length - 1, apex];
  }
  else if (typeLow.includes('prism') || typeLow.includes('cylinder') || typeLow.includes('cube')) {
    const b1 = addPolygon(0, n, r, startA);
    const b2 = addPolygon(height, n, r, startA, true);
    for (let i = 0; i < n; i += (n > 10 ? 3 : 1)) edges.push([b1 + i, b2 + i]);

    pts.push([0, 0, 0]); labels.push('o1');
    pts.push([0, 0, height]); labels.push('o2');
    axisPts = [pts.length - 2, pts.length - 1];
  }
  else if (typeLow.includes('plane') || typeLow.includes('square') || typeLow.includes('hexagon')) {
    addPolygon(0, n, r, startA);
  }
  else {
    pts.push([-side / 2, 0, 0], [side / 2, 0, 0]);
    labels.push('a', 'b');
    edges.push([0, 1]);
  }
  return { pts, edges, labels, axisPts };
};

export default function EngineeringGraphicsApp() {
  const [prompt, setPrompt] = useState("Draw the projections of a cone base 40mm diameter and axis 60 mm long resting on HP on its base with the axis inclined at 45 degree to the VP");
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [mode, setMode] = useState<'Learner' | 'Direct'>('Learner');
  const [showConstruction, setShowConstruction] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const recognitionRef = React.useRef<any>(null);

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      alert("Microphone recognition is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = 0; i < event.results.length; i++) finalTranscript += event.results[i][0].transcript;
      setPrompt(finalTranscript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.start();
  };

  const [params, setParams] = useState({ type: 'Cone', side: 20, height: 60, theta: 40, phi: 45, restFace: false, restCorner: false });
  const [solutionSteps, setSolutionSteps] = useState<string[]>([
    "Enter constraints to begin.",
    "Draw the principal XY reference line.",
    "Draw the true shape entirely, followed by dimensions and center identification.",
    "Cast vertical projectors up from the base line by line, then draw the solid elevation profile.",
    "The solid is inclined to the HP. Slowly tilt the Front View by required angle.",
    "Sequentially trace cross-projectors from the original Base and drop vertical projectors from the tilted Elevation to find the new points.",
    "Axis twists towards VP. The engine rotates the compressed plan to its correct mathematical location.",
    "Final vertical projectors are lifted into the sky and intersected with horizontal projectors to complete the drawing!"
  ]);

  const parsePrompt = async () => {
    setIsGenerating(true);

    try {
      const res = await fetch('/api/parse', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse prompt');

      setParams({
        type: data.type || 'Cone',
        side: data.side || 20,
        height: data.height || 60,
        theta: data.theta || 0,
        phi: data.phi || 0,
        restFace: data.restFace || false,
        restCorner: data.restCorner || false
      });
      if (data.solutionSteps && data.solutionSteps.length > 0) {
        setSolutionSteps(data.solutionSteps);
      }
      setCurrentStep(mode === 'Direct' ? 7 : 1);
    } catch (err: any) {
      console.error(err);
      alert(`Integration failed: ${err.message}.`);
    }
    setIsGenerating(false);
  };


  useEffect(() => {
    if (mode === 'Direct' && currentStep > 0 && currentStep < 7) setCurrentStep(7);
  }, [mode]);

  useEffect(() => {
    const activeElement = document.getElementById('active-step');
    if (activeElement) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentStep]);

  const SF = 3.2;
  const cy = 400;

  const { pts, edges, labels, axisPts } = generateShape(params.type, params.side, params.height, params.restCorner);

  let restingPts = translate(pts, 0, 0, 0);
  if (params.restFace) restingPts = restingPts.map(([x, y, z]) => [x, z, y]);

  // Fix XY Collision: Ensure the Y-distance perfectly clears the XY axis (minimum y must be positive)
  const minY = Math.min(...restingPts.map(p => p[1]));
  const maxX = Math.max(...restingPts.map(p => p[0]));
  // If minY is negative (like -20), we push it down by 20, PLUS a 20 pixel buffer.
  const dropY = (minY < 0 ? Math.abs(minY) : 0) + 15;
  restingPts = groundPoints(translate(restingPts, -maxX, dropY, 0));

  const stage1Pts = restingPts;

  const isPlane = params.type.toLowerCase().includes('plane');
  const isAxisHP = !isPlane && (!params.restFace && !prompt.toLowerCase().includes("base inclined"));
  const actualTheta = isAxisHP && params.theta ? (90 - params.theta) : params.theta;

  const stage2Pts = groundPoints(rotateY(stage1Pts, actualTheta));
  let beta = params.phi;
  if (!isPlane && params.phi > 0 && params.theta > 0 && isAxisHP) {
    const sinP = Math.sin(rad(params.phi)), axisS = Math.sin(rad(90 - actualTheta));
    if (axisS > 0 && Math.abs(sinP / axisS) <= 1) beta = (Math.asin(Math.abs(sinP / axisS)) * 180) / Math.PI;
  }
  const stage3Pts_raw = rotateZ(stage2Pts, beta);
  const minStage3Y = Math.min(...stage3Pts_raw.map(p => p[1]));
  const stage3Drop = minStage3Y < 15 ? 15 - minStage3Y : 0;
  const stage3Pts = groundPoints(translate(stage3Pts_raw, 0, stage3Drop, 0));

  const drawWireframe = (stPts: Point3D[], offsetX: number, type: 'TV' | 'FV', animating: boolean = true, initialDelay: number = 0) => {
    const isFV = type === 'FV';

    // Calculate 2D Silhouette
    const pts2d = stPts.map((p, i) => [p[0] * SF + offsetX, isFV ? cy - p[2] * SF : cy + p[1] * SF, i]);
    const boundaryCandidates = pts2d.filter((_, i) => !labels[i] || (!labels[i].startsWith('o') && !labels[i].startsWith('o1') && !labels[i].startsWith('o2')));
    const hullSet = convexHull(boundaryCandidates);

    let avgDepth = 0;
    stPts.forEach(p => { avgDepth += isFV ? p[1] : p[2]; });
    avgDepth /= stPts.length;

    return (
      <g>
        {axisPts.length === 2 && (
          <line
            x1={stPts[axisPts[0]][0] * SF + offsetX}
            y1={type === 'FV' ? cy - stPts[axisPts[0]][2] * SF : cy + stPts[axisPts[0]][1] * SF}
            x2={stPts[axisPts[1]][0] * SF + offsetX}
            y2={type === 'FV' ? cy - stPts[axisPts[1]][2] * SF : cy + stPts[axisPts[1]][1] * SF}
            stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="10 3 2 3"
            className={animating ? "animate-fade-in-seq" : "animate-fade-in-static"}
            style={animating ? { animationDelay: `${initialDelay + edges.length * 0.15}s` } : {}}
          />
        )}
        {edges.map(([i, j], idx) => {
          const p1 = stPts[i], p2 = stPts[j];

          let hidden = false;
          if (!(hullSet.has(i) && hullSet.has(j))) {
            const edgeDepth = isFV ? (p1[1] + p2[1]) / 2 : (p1[2] + p2[2]) / 2;
            // If depth is less than average (further away from observer), it's hidden behind the solid.
            // For FV, depth axis is Y (larger Y is closer to observer standing in front of VP).
            // For TV, depth axis is Z (larger Z is closer to observer looking down from top).
            if (edgeDepth < avgDepth - 0.1) hidden = true;
          }

          return (
            <line key={`wf-${idx}`} className={animating ? "draw-line-seq" : "draw-line-static"} pathLength="1"
              style={animating ? { animationDelay: `${initialDelay + idx * 0.15}s` } : {}}
              x1={p1[0] * SF + offsetX} y1={isFV ? cy - p1[2] * SF : cy + p1[1] * SF}
              x2={p2[0] * SF + offsetX} y2={isFV ? cy - p2[2] * SF : cy + p2[1] * SF}
              stroke={isFV ? "#60a5fa" : "#34d399"}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={hidden ? "8 6" : "none"}
              strokeOpacity="1"
            />
          );
        })}
      </g>
    )
  };

  const drawLabels = (stPts: Point3D[], offsetX: number, type: 'TV' | 'FV', animating: boolean = true, initialDelay: number = 0) => {
    return labels.map((l, i) => {
      if (!l) return null;
      const px = stPts[i][0] * SF + offsetX + (type === 'FV' ? 8 : -12);
      const py = type === 'FV' ? cy - stPts[i][2] * SF - 8 : cy + stPts[i][1] * SF + 12;
      const isCenter = l.startsWith('o');

      return (
        <g key={`lbl-${i}`} className={animating ? "animate-fade-in-seq" : "animate-fade-in-static"} style={animating ? { animationDelay: `${initialDelay + i * 0.05}s` } : {}}>
          <text x={px} y={py} fill="#ffffff" fontSize="14" fontWeight="600" stroke="#020617" strokeWidth="4" strokeLinejoin="round" paintOrder="stroke">{type === 'FV' ? l.toLowerCase() + "'" : l.toLowerCase()}</text>
          {isCenter && (
            <path d={`M ${px - (type === 'FV' ? 8 : -12) - 4} ${py + (type === 'FV' ? 8 : -12)} h 8 M ${px - (type === 'FV' ? 8 : -12)} ${py + (type === 'FV' ? 8 : -12) - 4} v 8`} stroke="#f43f5e" strokeWidth="1.5" />
          )}
        </g>
      )
    });
  }

  const drawProjectors = (stPts: Point3D[], offsetX: number, type: 'VERT' | 'HORIZ', toPts?: Point3D[], toOffset?: number, animating: boolean = true, initialDelay: number = 0) => {
    if (!showConstruction) return null;
    return stPts.map((p, idx) => {
      if (!labels[idx] && !axisPts.includes(idx) && (type === 'VERT' || type === 'HORIZ')) return null;
      const dropDelay = initialDelay + (idx * 0.15);

      if (type === 'VERT') {
        return <line key={`pv-${idx}`} className={animating ? "draw-line-seq" : "draw-line-static"} pathLength="1" style={animating ? { animationDelay: `${dropDelay}s` } : {}} x1={p[0] * SF + offsetX} y1={cy - p[2] * SF} x2={p[0] * SF + offsetX} y2={cy + p[1] * SF} stroke="#38bdf8" strokeWidth="0.5" />;
      } else if (type === 'HORIZ' && toPts && toOffset) {
        const tp = toPts[idx];
        return <line key={`ph-${idx}`} className={animating ? "draw-line-seq" : "draw-line-static"} pathLength="1" style={animating ? { animationDelay: `${dropDelay}s` } : {}} x1={p[0] * SF + offsetX} y1={cy + p[1] * SF} x2={tp[0] * SF + toOffset} y2={cy + tp[1] * SF} stroke="#38bdf8" strokeWidth="0.5" />
      }
      return null;
    });
  };

  const drawDimensions = (stPts: Point3D[], offsetX: number, type: 'TV' | 'FV', animating: boolean = true, initialDelay: number = 0) => {
    const isDiameter = params.type.toLowerCase().includes('cone') || params.type.toLowerCase().includes('cylinder');
    const baseLabel = isDiameter ? `⌀${params.side * 2}` : `SIDE: ${params.side}`;

    const boundaryPts = stPts.filter((_, i) => labels[i] && !labels[i].startsWith('o'));
    if (boundaryPts.length === 0) return null;

    if (type === 'TV') {
      const leftX = Math.min(...boundaryPts.map(p => p[0] * SF + offsetX));
      const rightX = Math.max(...boundaryPts.map(p => p[0] * SF + offsetX));
      const botY = Math.max(...boundaryPts.map(p => cy + p[1] * SF));
      const dimY = botY + 30;
      const textX = (leftX + rightX) / 2;

      return (
        <g className={animating ? "animate-fade-in-seq" : "animate-fade-in-static"} style={animating ? { animationDelay: `${initialDelay}s` } : {}}>
          <line x1={leftX} y1={botY + 5} x2={leftX} y2={dimY + 5} stroke="#38bdf8" strokeWidth="1" />
          <line x1={rightX} y1={botY + 5} x2={rightX} y2={dimY + 5} stroke="#38bdf8" strokeWidth="1" />

          <line x1={leftX} y1={dimY} x2={rightX} y2={dimY} stroke="#38bdf8" strokeWidth="1" />
          <polygon points={`${leftX},${dimY} ${leftX + 12},${dimY - 3} ${leftX + 12},${dimY + 3}`} fill="#38bdf8" />
          <polygon points={`${rightX},${dimY} ${rightX - 12},${dimY - 3} ${rightX - 12},${dimY + 3}`} fill="#38bdf8" />

          <text x={textX} y={dimY - 8} fill="#38bdf8" fontSize="13" fontWeight="bold" textAnchor="middle">{baseLabel}</text>
        </g>
      )
    } else {
      const tp = stPts[axisPts[1]];
      const botY = Math.max(...boundaryPts.map(p => cy - p[2] * SF));
      const topY = cy - tp[2] * SF;
      const leftX = Math.min(...boundaryPts.map(p => p[0] * SF + offsetX));
      const dimX = leftX - 35;

      return (
        <g className={animating ? "animate-fade-in-seq" : "animate-fade-in-static"} style={animating ? { animationDelay: `${initialDelay}s` } : {}}>
          <line x1={leftX - 5} y1={botY} x2={dimX - 5} y2={botY} stroke="#38bdf8" strokeWidth="1" />
          <line x1={leftX - 5} y1={topY} x2={dimX - 5} y2={topY} stroke="#38bdf8" strokeWidth="1" />

          <line x1={dimX} y1={botY} x2={dimX} y2={topY} stroke="#38bdf8" strokeWidth="1" />
          <polygon points={`${dimX},${botY} ${dimX - 3},${botY - 12} ${dimX + 3},${botY - 12}`} fill="#38bdf8" />
          <polygon points={`${dimX},${topY} ${dimX - 3},${topY + 12} ${dimX + 3},${topY + 12}`} fill="#38bdf8" />

          <text x={dimX - 8} y={(topY + botY) / 2} fill="#38bdf8" fontSize="13" fontWeight="bold" textAnchor="middle" transform={`rotate(-90 ${dimX - 8} ${(topY + botY) / 2})`}>AXIS: {params.height}</text>
        </g>
      )
    }
  }

  const s1x = 220, s2x = 700, s3x = 1180;
  const TIME_PROJ = pts.length * 0.15 + 0.3;
  const TIME_EDGE = edges.length * 0.15 + 0.3;

  const stepsTitles = [
    "Input Required",
    "Setup XY Plane",
    "Stage 1: Top View Base",
    "Stage 1: Front View Elevation",
    "Stage 2: HP Inclination",
    "Stage 2: Top View Projection",
    "Stage 3: VP Inclination",
    "Stage 3: Final Front View"
  ];

  return (
    <div className="h-screen overflow-hidden bg-slate-950 text-slate-50 font-sans flex flex-col">
      <style>{`
          @keyframes sketchAnim { 0% { stroke-dashoffset: 1; } 100% { stroke-dashoffset: 0; } }
          @keyframes fadeInAnim { 0% { opacity: 0; } 100% { opacity: 1; } }
          .draw-line-seq { stroke-dasharray: 1; stroke-dashoffset: 1; animation: sketchAnim 0.7s cubic-bezier(0.4, 0, 0.2, 1) both; }
          .animate-fade-in-seq { opacity: 0; animation: fadeInAnim 1s ease-out both; }
          .draw-line-static { stroke-dasharray: none; stroke-dashoffset: 0; opacity: 1; }
          .animate-fade-in-static { opacity: 1; }
       `}</style>
      <header className="border-b border-white/10 bg-slate-900/50 backdrop-blur-md px-6 py-4 flex justify-between items-center z-10 sticky top-0">
        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400"><Compass className="w-6 h-6" /></div><div><h1 className="text-xl font-bold bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">DraftAI Solver</h1></div></div>
        <div className="flex items-center gap-4"><button onClick={() => setMode('Learner')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 ${mode === 'Learner' ? 'bg-teal-500 text-white' : 'text-slate-400 hover:text-white'}`}><Play className="w-4 h-4" /> Learner Mode</button><button onClick={() => setMode('Direct')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 ${mode === 'Direct' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-white'}`}><FastForward className="w-4 h-4" /> Direct Output</button></div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">

        {/* LEFT SIDEBAR: PROMPT & TIMELINE */}
        <div className={`${mobileSidebarOpen ? 'fixed inset-x-0 bottom-0 h-[75vh] w-full rounded-t-[2.5rem] bg-slate-900/60 backdrop-blur-3xl border-t border-white/20 z-[60] shadow-[0_-20px_50px_rgba(20,184,166,0.3)] flex' : 'hidden'} lg:relative lg:bottom-auto lg:inset-x-auto lg:h-full lg:flex lg:w-[450px] shrink-0 lg:bg-slate-900 lg:backdrop-blur-none lg:border-r lg:border-t-0 lg:border-white/10 lg:rounded-none flex-col lg:z-20 lg:shadow-2xl relative overflow-hidden transition-all duration-500`}>

          {/* PROMPT HEADER (STICKY) */}
          <div className="p-6 border-b border-white/10 bg-slate-900/90 backdrop-blur-3xl sticky top-0 z-30 shadow-[0_10px_20px_-10px_rgba(0,0,0,0.5)]">
            <h2 className="text-xs font-bold text-teal-400 uppercase tracking-widest flex items-center gap-2 mb-4">Auto-Drafter Prompt</h2>
            <div className="relative rounded-2xl overflow-hidden p-[2px] group">
              <div className="absolute inset-[-100%] animate-[spin_6s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0_300deg,#14b8a6_360deg)] opacity-70 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative bg-slate-900 rounded-[calc(1.5rem-2px)] p-4 shadow-inner">
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="w-full bg-transparent border-none text-sm text-slate-200 focus:outline-none resize-none pb-12" rows={3} placeholder="Type question here..." />
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <button onClick={toggleListening} className={`p-3 rounded-lg ${isListening ? 'bg-red-500 animate-pulse text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-white'} transition-all`}>
                    <Mic className="w-4 h-4" />
                  </button>
                  <button onClick={parsePrompt} disabled={isGenerating} className="p-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50 transition-all shadow-lg group-hover:scale-105">
                    {isGenerating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <PencilRuler className="w-4 h-4 text-white" />}
                  </button>
                </div>
              </div>
            </div>

            {currentStep > 0 && !isGenerating && (
              <div className="mt-4 bg-slate-950/50 border border-teal-500/20 rounded-xl p-3 flex items-center justify-between text-xs font-mono text-teal-300">
                <span className="flex items-center gap-2 font-bold"><Zap className="w-3 h-3 text-amber-400" /> AI Engine Engaged</span>
                <span className="text-slate-400">{params.type}</span>
              </div>
            )}
          </div>

          {/* SCROLLING TIMELINE */}
          <div className="flex-1 overflow-y-auto p-8 relative pb-32">
            {currentStep > 0 && (
              <div className="relative">
                <div className="absolute top-8 bottom-0 left-[23px] w-0.5 bg-gradient-to-b from-teal-500/40 via-teal-500/10 to-transparent rounded-full"></div>
                {stepsTitles.slice(1, currentStep + 1).map((title, idx) => {
                  const isCurrent = (idx + 1 === currentStep);
                  return (
                    <div key={idx} id={isCurrent ? "active-step" : undefined} className="relative pt-4 pb-2 group">
                      <div className={`absolute left-[-23px] top-[32px] w-3 h-3 rounded-full bg-slate-900 border-2 border-teal-500 ring-4 ring-slate-900 z-10 transition-all duration-700 ${isCurrent ? 'bg-teal-400 shadow-[0_0_15px_rgba(45,212,191,0.9)] scale-150' : 'opacity-60'}`}></div>

                      {isCurrent ? (
                        <div className="relative rounded-2xl p-[2px] shadow-[0_0_20px_rgba(20,184,166,0.3)] overflow-hidden scale-[1.02] transition-all duration-700 mx-1">
                          <div className="absolute inset-[-100%] animate-[spin_5s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0_280deg,#2dd4bf_360deg)] opacity-90" />
                          <div className="relative bg-slate-900/90 backdrop-blur-md rounded-[calc(1rem-2px)] p-6 shadow-inner">
                            <h4 className="text-md font-bold mb-3 flex items-center gap-3 text-teal-300">
                              <span className="text-[10px] px-2 py-1 bg-slate-950/80 rounded-md font-mono text-teal-400 border border-teal-500/30">STEP {idx + 1}</span>
                              <span className="leading-tight">{title}</span>
                            </h4>
                            <p className="text-slate-200 text-sm leading-relaxed font-light">{solutionSteps[idx + 1]?.replace(/^\d+[\.\)]\s*/, '')}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-6 mx-1 rounded-2xl border transition-all duration-700 ease-out bg-slate-900/30 border-white/5 opacity-50 hover:opacity-80">
                          <h4 className="text-md font-bold mb-3 flex items-center gap-3 text-slate-400">
                            <span className="text-[10px] px-2 py-1 bg-slate-950/50 rounded-md font-mono text-teal-500/50 border border-teal-500/10">STEP {idx + 1}</span>
                            <span className="leading-tight">{title}</span>
                          </h4>
                          <p className="text-slate-300 text-sm leading-relaxed font-light line-clamp-2">{solutionSteps[idx + 1]?.replace(/^\d+[\.\)]\s*/, '')}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* BOTTOM FIXED CONTROLS */}
          {mode === 'Learner' && currentStep > 0 && (
            <div className="absolute bottom-0 w-full p-6 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent z-40">
              <div className="flex items-center gap-4 bg-slate-900/90 backdrop-blur-2xl p-2 rounded-2xl border border-teal-500/30 shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
                <button onClick={() => setCurrentStep(p => Math.max(1, p - 1))} disabled={currentStep === 1} className="flex-1 py-3 text-xs font-bold text-slate-400 hover:text-white rounded-xl transition-all disabled:opacity-30">Prev</button>
                <button onClick={() => setCurrentStep(p => Math.min(7, p + 1))} disabled={currentStep === 7} className="flex-[2] py-3 bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 text-slate-950 rounded-xl text-xs font-black shadow-[0_0_15px_rgba(20,184,166,0.3)] transition-all disabled:opacity-30">Next Step</button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT AREA: SVG DRAWING BOARD */}
        <div className="flex-1 w-full shrink-0 bg-[radial-gradient(ellipse_at_center,rgba(20,184,166,0.1),transparent_60%)] bg-slate-950 relative flex items-center justify-start lg:justify-center p-0 lg:p-8 z-10 overflow-x-auto overflow-y-hidden">

          {/* MOBILE TOGGLE FAB */}
          <button
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            className="lg:hidden fixed bottom-6 right-6 z-[70] bg-teal-600 hover:bg-teal-500 text-white rounded-full p-4 shadow-[0_10px_25px_rgba(20,184,166,0.6)] flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
          >
            {mobileSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          {/* PENCIL LEGEND AT TOP */}
          {currentStep > 0 && (
            <div className="absolute top-6 left-6 right-6 flex justify-between items-start z-30 pointer-events-none">

              {/* AI Rules Pill (Left) */}
              <div className="bg-slate-900/80 backdrop-blur-md rounded-xl p-4 border border-amber-500/20 shadow-xl pointer-events-auto">
                <h3 className="text-[10px] font-bold text-amber-300 uppercase tracking-widest mb-2 flex items-center gap-2"><Zap className="w-3 h-3" /> Parameters</h3>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400">
                  <div><span className="text-slate-500">Solid:</span> <span className="text-white">{params.type}</span></div>
                  <div><span className="text-slate-500">Size:</span> <span className="text-white">{params.side}x{params.height}</span></div>
                  <div><span className="text-slate-500">Rest:</span> <span className="text-white">{params.restCorner ? "Corner" : params.restFace ? "Face" : "Edge"}</span></div>
                  <div><span className="text-slate-500">Angle:</span> <span className="text-white">{params.theta}° / {params.phi}°</span></div>
                </div>
              </div>

              {/* Pencil Grade Legend (Right) */}
              <div className="bg-slate-900/80 backdrop-blur-md rounded-xl p-4 border border-teal-500/30 text-[11px] shadow-xl min-w-[200px] pointer-events-auto">
                <h4 className="font-bold text-slate-200 mb-3 border-b border-white/10 pb-2 uppercase tracking-widest flex items-center gap-2"><code className="text-xl drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">✏️</code> Pencil Grades</h4>
                <div className="space-y-3 font-mono text-slate-400">
                  <div className="flex items-center justify-between">
                    <span>HB (Markings & Text)</span>
                    <span className="font-bold text-white text-sm">a' b' 40</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>H (Visible / Hidden)</span>
                    <div className="flex flex-col gap-1.5 items-end">
                      <svg width="24" height="6"><line x1="0" y1="3" x2="24" y2="3" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" /></svg>
                      <svg width="24" height="6"><line x1="0" y1="3" x2="24" y2="3" stroke="#60a5fa" strokeWidth="2.5" strokeDasharray="4 3" strokeLinecap="round" /></svg>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>2H (Constr. / Dims)</span>
                    <svg width="24" height="6"><line x1="0" y1="3" x2="24" y2="3" stroke="#38bdf8" strokeWidth="1" strokeLinecap="round" /></svg>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep > 0 && (
            <div className="min-w-[1200px] h-full lg:min-w-0 lg:w-full lg:h-full relative pointer-events-auto">
              <svg viewBox="-100 0 1500 850" preserveAspectRatio="xMidYMid meet" className="w-full h-full drop-shadow-2xl overflow-visible">
                {currentStep === 1 && (
                  <g><line className="draw-line-seq" pathLength="1" x1="-100" y1={cy} x2="1450" y2={cy} stroke="#cbd5e1" strokeWidth="2" strokeOpacity="0.8" /><text x="-70" y={cy - 10} fill="#94a3b8" fontSize="16" className="animate-fade-in-seq" style={{ animationDelay: '0.3s' }}>X</text><text x="1420" y={cy - 10} fill="#94a3b8" fontSize="16" className="animate-fade-in-seq" style={{ animationDelay: '0.3s' }}>Y</text></g>
                )}
                {currentStep >= 2 && currentStep !== 1 && <g><line x1="-100" y1={cy} x2="1450" y2={cy} stroke="#cbd5e1" strokeWidth="2" strokeOpacity="0.8" /><text x="-70" y={cy - 10} fill="#94a3b8" fontSize="16">X</text><text x="1420" y={cy - 10} fill="#94a3b8" fontSize="16">Y</text></g>}

                {currentStep === 2 && <g>{drawWireframe(stage1Pts, s1x, 'TV', true, 0.2)}{drawDimensions(stage1Pts, s1x, 'TV', true, TIME_EDGE)}{drawLabels(stage1Pts, s1x, 'TV', true, TIME_EDGE)}</g>}
                {currentStep > 2 && <g>{drawWireframe(stage1Pts, s1x, 'TV', false)}{drawDimensions(stage1Pts, s1x, 'TV', false)}{drawLabels(stage1Pts, s1x, 'TV', false)}</g>}

                {currentStep === 3 && <g>{drawProjectors(stage1Pts, s1x, 'VERT', undefined, undefined, true, 0.2)}{drawWireframe(stage1Pts, s1x, 'FV', true, TIME_PROJ)}{drawDimensions(stage1Pts, s1x, 'FV', true, TIME_PROJ + TIME_EDGE)}{drawLabels(stage1Pts, s1x, 'FV', true, TIME_PROJ + TIME_EDGE)}</g>}
                {currentStep > 3 && <g>{drawProjectors(stage1Pts, s1x, 'VERT', undefined, undefined, false)}{drawWireframe(stage1Pts, s1x, 'FV', false)}{drawDimensions(stage1Pts, s1x, 'FV', false)}{drawLabels(stage1Pts, s1x, 'FV', false)}</g>}

                {currentStep === 4 && <g>{drawWireframe(stage2Pts, s2x, 'FV', true, 0.2)}{drawLabels(stage2Pts, s2x, 'FV', true, TIME_EDGE)}</g>}
                {currentStep > 4 && <g>{drawWireframe(stage2Pts, s2x, 'FV', false)}{drawLabels(stage2Pts, s2x, 'FV', false)}</g>}

                {currentStep === 5 && <g>{drawProjectors(stage1Pts, s1x, 'HORIZ', stage2Pts, s2x, true, 0.2)}{drawProjectors(stage2Pts, s2x, 'VERT', undefined, undefined, true, 0.2)}{drawWireframe(stage2Pts, s2x, 'TV', true, TIME_PROJ + 0.2)}{drawLabels(stage2Pts, s2x, 'TV', true, TIME_PROJ + TIME_EDGE + 0.2)}</g>}
                {currentStep > 5 && <g>{drawProjectors(stage1Pts, s1x, 'HORIZ', stage2Pts, s2x, false)}{drawProjectors(stage2Pts, s2x, 'VERT', undefined, undefined, false)}{drawWireframe(stage2Pts, s2x, 'TV', false)}{drawLabels(stage2Pts, s2x, 'TV', false)}</g>}

                {currentStep === 6 && <g>{drawWireframe(stage3Pts, s3x, 'TV', true, 0.2)}{drawLabels(stage3Pts, s3x, 'TV', true, TIME_EDGE)}</g>}
                {currentStep > 6 && <g>{drawWireframe(stage3Pts, s3x, 'TV', false)}{drawLabels(stage3Pts, s3x, 'TV', false)}</g>}

                {currentStep === 7 && <g>
                  {drawProjectors(stage3Pts, s3x, 'VERT', undefined, undefined, true, 0.2)}
                  {showConstruction && stage2Pts.map((p, idx) => { if (!labels[idx] && !axisPts.includes(idx)) return null; return <line key={`phf-${currentStep}-${idx}`} className="draw-line-seq" pathLength="1" style={{ animationDelay: `${0.2 + idx * 0.15}s` }} x1={p[0] * SF + s2x} y1={cy - p[2] * SF} x2={stage3Pts[idx][0] * SF + s3x} y2={cy - stage3Pts[idx][2] * SF} stroke="#38bdf8" strokeWidth="0.5" /> })}
                  {drawWireframe(stage3Pts, s3x, 'FV', true, TIME_PROJ + 0.2)}
                  {drawLabels(stage3Pts, s3x, 'FV', true, TIME_PROJ + TIME_EDGE + 0.2)}
                </g>}
                {currentStep > 7 && <g>
                  {drawProjectors(stage3Pts, s3x, 'VERT', undefined, undefined, false)}
                  {showConstruction && stage2Pts.map((p, idx) => { if (!labels[idx] && !axisPts.includes(idx)) return null; return <line key={`phf-${currentStep}-${idx}`} x1={p[0] * SF + s2x} y1={cy - p[2] * SF} x2={stage3Pts[idx][0] * SF + s3x} y2={cy - stage3Pts[idx][2] * SF} stroke="#38bdf8" strokeWidth="0.5" /> })}
                  {drawWireframe(stage3Pts, s3x, 'FV', false)}
                  {drawLabels(stage3Pts, s3x, 'FV', false)}
                </g>}
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}