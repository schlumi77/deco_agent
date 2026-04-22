import { describe, it, expect } from 'vitest';
import { planDive } from './planner.js';

describe('CCR Gas Display', () => {
    it('should include the calculated gas mixture in brackets for CCR dives', () => {
        // Depth 50m, Tx 18/45 diluent, SP 1.3
        // Ambient pressure at 50m is 6.0 bar.
        // P_dry = 6.0 - 0.0627 = 5.9373
        // fO2 = 1.3 / 5.9373 = 0.2189... (approx 22%)
        // fHe = 0.45 * (1 - 0.22) / (1 - 0.18) = 0.45 * 0.78 / 0.82 = 0.428... (approx 43%)
        
        const result = planDive(50, 20, "Tx 18/45", ["Tx 50/15", "Oxygen"], 0.5, 0.8, true, 1.3);
        
        // Check bottom segment
        const bottomSegment = result.schedule[0];
        expect(bottomSegment.depth).toBe(50);
        expect(bottomSegment.gas).toContain('[22/43]');
        expect(bottomSegment.gas).toContain('CCR SP 1.3');
    });

    it('should use deco gas setpoint for deco stops', () => {
        // At 6m, Oxygen SP 1.4
        // P_amb = 1.6 bar. P_dry = 1.5373
        // fO2 = 1.4 / 1.5373 = 0.91... But loop fO2 is Math.max(dil.fO2, sp/P_dry). 
        // For Oxygen diluent, fO2 is 1.0.
        // So loop fO2 should be 1.0.
        // fHe should be 0.
        
        const result = planDive(50, 20, "Tx 18/45", ["Tx 50/15", "Oxygen"], 0.5, 0.8, true, 1.3);
        
        const oxygenStop = result.schedule.find(s => s.depth === 6);
        if (oxygenStop) {
            expect(oxygenStop.gas).toContain('CCR Oxygen SP 1.4');
            expect(oxygenStop.gas).toContain('[100/0]');
        }
    });

    it('should NOT include brackets for OC dives', () => {
        const result = planDive(50, 20, "Tx 18/45", ["Tx 50/15", "Oxygen"], 0.5, 0.8, false);
        
        const bottomSegment = result.schedule[0];
        expect(bottomSegment.gas).toBe("Tx 18/45");
        expect(bottomSegment.gas).not.toContain('[');
    });
});
