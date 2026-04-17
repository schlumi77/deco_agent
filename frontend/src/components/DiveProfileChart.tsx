import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine, Label } from 'recharts';
import type { ProfileEntry } from '../types';

interface Props {
  data: ProfileEntry[];
}

const DiveProfileChart: React.FC<Props> = ({ data }) => {
  const [refAreaLeft, setRefAreaLeft] = useState<string | number>('');
  const [refAreaRight, setRefAreaRight] = useState<string | number>('');
  const [left, setLeft] = useState<string | number>('dataMin');
  const [right, setRight] = useState<string | number>('dataMax');
  const [top, setTop] = useState<string | number>('dataMax');
  const [bottom, setBottom] = useState<string | number>(0);

  // Identify gas switches
  const gasSwitches: { time: number; gas: string }[] = [];
  let maxDepth = 0;
  if (data.length > 0) {
    let currentGas = data[0].gas;
    data.forEach((point) => {
      if (point.depth > maxDepth) maxDepth = point.depth;
      if (point.gas !== currentGas) {
        gasSwitches.push({ time: point.time, gas: point.gas });
        currentGas = point.gas;
      }
    });
  }

  // Calculate ticks for every 3 meters
  const roundedMaxDepth = Math.ceil(maxDepth / 3) * 3;
  const defaultTicks = [];
  for (let i = 0; i <= roundedMaxDepth; i += 3) {
    defaultTicks.push(i);
  }

  const zoom = () => {
    if (refAreaLeft === refAreaRight || refAreaRight === '') {
      setRefAreaLeft('');
      setRefAreaRight('');
      return;
    }

    let [l, r] = [refAreaLeft, refAreaRight];
    if (typeof l === 'number' && typeof r === 'number' && l > r) [l, r] = [r, l];

    setLeft(l);
    setRight(r);
    setRefAreaLeft('');
    setRefAreaRight('');
  };

  const zoomOut = () => {
    setLeft('dataMin');
    setRight('dataMax');
    setTop('dataMax');
    setBottom(0);
    setRefAreaLeft('');
    setRefAreaRight('');
  };

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#1a1a1a', padding: '10px', borderRadius: '8px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 className="desktop-only" style={{ color: '#00ffcc', margin: 0, fontSize: '14px', fontFamily: 'monospace' }}>DIVE PROFILE (DEPTH vs TIME)</h3>
        {(left !== 'dataMin' || right !== 'dataMax') && (
          <button 
            onClick={zoomOut}
            style={{ 
              background: '#333', color: '#00ffcc', border: '1px solid #444', 
              fontSize: '10px', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' 
            }}
          >RESET ZOOM</button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
        <AreaChart 
          data={data} 
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          onMouseDown={(e) => e && setRefAreaLeft(e.activeLabel || '')}
          onMouseMove={(e) => e && refAreaLeft && setRefAreaRight(e.activeLabel || '')}
          onMouseUp={zoom}
        >
          <defs>
            <linearGradient id="colorDepth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00ffcc" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#00ffcc" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
          <XAxis 
            dataKey="time" 
            stroke="#888" 
            fontSize={10}
            domain={[left, right]}
            type="number"
            tickFormatter={(val) => `${Math.round(val)}min`}
            label={{ value: 'Time (min)', position: 'insideBottomRight', offset: -5, fill: '#666', fontSize: 10 }}
          />
          <YAxis 
            stroke="#888" 
            fontSize={10} 
            reversed 
            ticks={defaultTicks}
            domain={[bottom, top]}
            label={{ value: 'Depth (m)', angle: -90, position: 'insideLeft', fill: '#666', fontSize: 10 }}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#222', border: '1px solid #444', color: '#fff' }}
            itemStyle={{ color: '#00ffcc' }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any) => [`${value}m`, 'Depth']}
            labelFormatter={(label) => `Time: ${Math.round(Number(label))} min`}
          />
          <Area 
            type="linear" 
            dataKey="depth" 
            stroke="#00ffcc" 
            fillOpacity={1} 
            fill="url(#colorDepth)" 
            isAnimationActive={false}
          />
          
          {gasSwitches.map((sw, idx) => (
            <ReferenceLine
              key={idx}
              x={sw.time}
              stroke="#ffcc00"
              strokeDasharray="5 5"
              strokeWidth={1.5}
            >
              <Label 
                value={sw.gas} 
                position="insideTopLeft" 
                fill="#ffcc00" 
                fontSize={10} 
                offset={10}
                fontWeight="bold"
              />
            </ReferenceLine>
          ))}

          {refAreaLeft && refAreaRight ? (
            <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#00ffcc" fillOpacity={0.1} />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
      </div>
      <div className="desktop-only" style={{ fontSize: '9px', color: '#444', textAlign: 'center' }}>DRAG TO ZOOM</div>
    </div>
  );
};

export default DiveProfileChart;
