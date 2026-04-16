import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import type { TissueLoad } from '../types';

interface Props {
  data: TissueLoad[];
}

const TissueChart: React.FC<Props> = ({ data }) => {
  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#1a1a1a', padding: '10px', borderRadius: '8px', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ color: '#00ffcc', margin: '0 0 10px 0', fontSize: '14px', fontFamily: 'monospace' }}>TISSUE LOADING</h3>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
          <XAxis 
            dataKey="compartment" 
            stroke="#888" 
            fontSize={10}
            tickLine={false}
          />
          <YAxis 
            stroke="#888" 
            fontSize={10} 
            domain={[0, 100]}
            tickLine={false}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#222', border: '1px solid #444', color: '#fff' }}
            itemStyle={{ color: '#00ffcc' }}
          />
          <ReferenceLine y={100} stroke="#ff4444" strokeDasharray="3 3" />
          <Bar dataKey="load_percent" radius={[2, 2, 0, 0]}>
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.load_percent > 100 ? '#ff4444' : entry.load_percent > 80 ? '#ffcc00' : '#00ffcc'} 
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TissueChart;
