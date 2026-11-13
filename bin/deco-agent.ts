#!/usr/bin/env tsx
import { Command, InvalidArgumentError } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'node:fs';
import { 
    planDive, 
    planBailout,
    calculateGasRequirements,
    GAS_RESERVE_FACTOR,
    GASES, 
    PLAN_DEFAULTS,
    calculateMod, 
    calculateMinOd, 
    calculateEnd 
} from '../shared/engine/planner.js';

function parseNumber(value: string): number {
    const n = Number(value);
    if (value.trim() === '' || !Number.isFinite(n)) throw new InvalidArgumentError('Not a number.');
    return n;
}

function parseChoice(choices: string[]) {
    return (value: string): string => {
        const v = value.toLowerCase();
        if (!choices.includes(v)) throw new InvalidArgumentError(`Allowed: ${choices.join(', ')}.`);
        return v;
    };
}

// The version lives in the root package.json. Walk up to find it so this works
// both from source (bin/) and from the compiled output (dist/bin/).
function readVersion(): string {
    for (const rel of ['../package.json', '../../package.json']) {
        try {
            const pkg = JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf-8'));
            if (pkg.name === 'deco-agent') return pkg.version;
        } catch {
            // try the next location
        }
    }
    return 'unknown';
}

const program = new Command();

program
  .name('deco-agent')
  .description('Technical Diving Gas Management and Decompression Planning Utility (ZHL-16B/C)')
  .version(readVersion());

program
  .command('gases')
  .description('Show standard diving gases and their limits')
  .action(() => {
    console.log(chalk.bold('\nStandard Diving Gases:'));
    console.log(chalk.gray(''.padEnd(84, '-')));
    console.log(`${chalk.bold('Gas'.padEnd(10))} | ${chalk.bold('Type'.padEnd(8))} | ${chalk.bold('fO2'.padStart(4))} | ${chalk.bold('fHe'.padStart(4))} | ${chalk.bold('Limit'.padStart(5))} | ${chalk.bold('MOD'.padStart(8))} | ${chalk.bold('MinOD'.padStart(8))} | ${chalk.bold('END@MOD'.padStart(8))}`);
    console.log(chalk.gray(''.padEnd(84, '-')));
    
    GASES.forEach(gas => {
        const limitPo2 = gas.type === 'deco' ? 1.6 : 1.2;
        const mod = calculateMod(gas.fO2, limitPo2);
        const minOd = calculateMinOd(gas.fO2);
        const end = calculateEnd(mod, gas.fHe);
        
        console.log(`${gas.name.padEnd(10)} | ${gas.type.padEnd(8)} | ${gas.fO2.toFixed(2).padStart(4)} | ${gas.fHe.toFixed(2).padStart(4)} | ${limitPo2.toFixed(1).padStart(5)} | ${mod.toFixed(1).padStart(7)}m | ${minOd.toFixed(1).padStart(7)}m | ${end.toFixed(1).padStart(7)}m`);
    });
  });

program
  .command('plan')
  .description('Calculate a dive plan')
  .requiredOption('-d, --depth <number>', 'Maximum depth in meters', parseNumber)
  .requiredOption('-t, --time <number>', 'Bottom time in minutes', parseNumber)
  .option('-g, --gas <string>', 'Bottom gas/diluent name', 'Tx 6/90')
  .option('-m, --mode <string>', 'Dive mode (ccr/oc)', parseChoice(['ccr', 'oc']), 'ccr')
  .option('--gf-low <number>', 'Gradient Factor Low %', parseNumber, PLAN_DEFAULTS.gf_low)
  .option('--gf-high <number>', 'Gradient Factor High %', parseNumber, PLAN_DEFAULTS.gf_high)
  .option('--setpoint <number>', 'CCR Bottom Setpoint', parseNumber, PLAN_DEFAULTS.setpoint)
  .option('--deco-setpoint <number>', 'CCR Deco Setpoint (default: same as --setpoint)', parseNumber)
  .option('--deco-gas-setpoint <number>', 'CCR Deco Gas Switch Setpoint', parseNumber, PLAN_DEFAULTS.deco_gas_setpoint)
  .option('--desc-rate <number>', 'Descent Rate m/min', parseNumber, PLAN_DEFAULTS.descent_rate)
  .option('--asc-rate <number>', 'Ascent Rate m/min', parseNumber, PLAN_DEFAULTS.ascent_rate)
  .option('--model <string>', 'Bühlmann Model (B/C)', parseChoice(['b', 'c']), PLAN_DEFAULTS.model.toLowerCase())
  .option('--no-force-6m', 'Allow 3m stops')
  .action((options) => {
    const isCcr = options.mode === 'ccr';
    const decoGases = ["Oxygen", "Tx 50/15", "Tx 35/35", "Tx 24/35", "Tx 17/70"];
    
    try {
        const request = {
            depth: options.depth,
            bottom_time: options.time,
            bottom_gas: options.gas,
            deco_gases: decoGases,
            gf_low: options.gfLow,
            gf_high: options.gfHigh,
            is_ccr: isCcr,
            setpoint: options.setpoint,
            deco_setpoint: options.decoSetpoint,
            deco_gas_setpoint: options.decoGasSetpoint,
            descent_rate: options.descRate,
            ascent_rate: options.ascRate,
            force_6m: options.force6m !== false,
            model: options.model,
        };
        const result = planDive(request);
        const bailout = isCcr ? planBailout(request) : null;
        const gasReqs = calculateGasRequirements(request, result, bailout);
        const scheduleHeader = () => {
            console.log(`${chalk.bold('Depth'.padStart(5))} | ${chalk.bold('RT'.padStart(7))} | ${chalk.bold('Time'.padStart(5))} | ${chalk.bold('Gas'.padEnd(12))} | ${chalk.bold('CNS%'.padStart(6))} | ${chalk.bold('OTU'.padStart(6))}`);
            console.log(chalk.gray(''.padEnd(65, '-')));
        };
        const scheduleRow = (s: typeof result.schedule[number]) =>
            console.log(`${s.depth.toFixed(0).padStart(4)}m | ${s.run_time.toFixed(1).padStart(5)}min | ${s.time.toFixed(0).padStart(4)}min | ${s.gas.padEnd(12)} | ${s.cns.toFixed(1).padStart(5)}% | ${s.otu.toFixed(1).padStart(6)}`);

        console.log(chalk.bold(`\nDeco Schedule (${isCcr ? 'CCR' : 'OC'} | Model: ZH-L16${options.model.toUpperCase()} | GF: ${options.gfLow}/${options.gfHigh}):`));
        console.log(chalk.gray(`Rates: Descent ${options.descRate}m/min, Ascent ${options.ascRate}m/min`));
        scheduleHeader();
        result.schedule.forEach(scheduleRow);

        if (bailout) {
            console.log(chalk.bold('\nBailout Schedule (open circuit from the end of bottom time):'));
            scheduleHeader();
            bailout.schedule.forEach(scheduleRow);
        }

        if (isCcr) {
            console.log(chalk.bold('\nOnboard Gas Requirements (Minimum for Dive):'));
            Object.entries(gasReqs.onboard).forEach(([gas, vol]) => {
                console.log(`  ${gas.padEnd(15)}: ${vol.toFixed(0).padStart(5)} L`);
            });
        }

        const reserve = `${GAS_RESERVE_FACTOR}x reserve, SAC 15 L/min`;
        console.log(chalk.bold(isCcr
            ? `\nBailout Gas Requirements (OC ascent from the end of bottom time, ${reserve}):`
            : `\nGas Requirements (${reserve}):`));
        Object.entries(gasReqs.open_circuit).forEach(([gas, vol]) => {
            console.log(`  ${gas.padEnd(15)}: ${vol.toFixed(0).padStart(5)} L`);
        });

        console.log(chalk.bold('\nOxygen Toxicity:'));
        console.log(`  CNS Clock: ${result.cns_percent.toFixed(1).padStart(6)} %`);
        console.log(`  OTUs:      ${result.otus.toFixed(1).padStart(6)}`);

        console.log(chalk.bold('\nSurface Pressure Load:'));
        console.log(`  Surface GF: ${result.surface_gf.toFixed(1).padStart(6)} %`);

        const warnings = [...result.warnings, ...(bailout?.warnings ?? [])];
        if (warnings.length > 0) {
            console.log(chalk.bold.red('\nSafety Warnings:'));
            warnings.forEach(w => console.log(chalk.red(`  !!! ${w} !!!`)));
        }

    } catch (err: any) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
    }
  });

program.parse();
