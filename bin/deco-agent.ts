#!/usr/bin/env tsx
import { Command } from 'commander';
import chalk from 'chalk';
import { 
    planDive, 
    calculateGasConsumption, 
    GASES, 
    calculateMod, 
    calculateMinOd, 
    calculateEnd 
} from '../shared/engine/planner.js';

const program = new Command();

program
  .name('deco-agent')
  .description('Technical Diving Gas Management and Decompression Planning Utility (ZHL-16C)')
  .version('3.0.0');

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
  .requiredOption('-d, --depth <number>', 'Maximum depth in meters', parseFloat)
  .requiredOption('-t, --time <number>', 'Bottom time in minutes', parseFloat)
  .option('-g, --gas <string>', 'Bottom gas/diluent name', 'Tx 6/90')
  .option('-m, --mode <string>', 'Dive mode (ccr/oc)', 'ccr')
  .option('--gf-low <number>', 'Gradient Factor Low %', '50')
  .option('--gf-high <number>', 'Gradient Factor High %', '80')
  .option('--setpoint <number>', 'CCR Bottom Setpoint', '1.2')
  .option('--deco-setpoint <number>', 'CCR Deco Setpoint', '1.2')
  .option('--deco-gas-setpoint <number>', 'CCR Deco Gas Switch Setpoint', '1.4')
  .option('--desc-rate <number>', 'Descent Rate m/min', '20')
  .option('--asc-rate <number>', 'Ascent Rate m/min', '10')
  .option('--model <string>', 'Bühlmann Model (B/C)', 'C')
  .option('--no-force-6m', 'Allow 3m stops')
  .action((options) => {
    const isCcr = options.mode.toLowerCase() === 'ccr';
    const decoGases = ["Oxygen", "Tx 50/15", "Tx 35/35", "Tx 24/35", "Tx 17/70"];
    
    try {
        const result = planDive(
            options.depth,
            options.time,
            options.gas,
            decoGases,
            options.gfLow / 100,
            options.gfHigh / 100,
            isCcr,
            options.setpoint,
            options.decoSetpoint,
            options.decoGasSetpoint,
            options.descRate,
            options.ascRate,
            options.force6m !== false,
            options.model
        );

        const gasReqs = calculateGasConsumption(
            result.schedule,
            options.depth,
            options.time,
            options.gas,
            15.0, // SAC
            isCcr,
            1.0,  // O2 cons
            options.descRate,
            options.ascRate
        );

        console.log(chalk.bold(`\nDeco Schedule (${isCcr ? 'CCR' : 'OC'} | Model: ZH-L16${options.model.toUpperCase()} | GF: ${options.gfLow}/${options.gfHigh}):`));
        console.log(chalk.gray(`Rates: Descent ${options.descRate}m/min, Ascent ${options.ascRate}m/min`));
        console.log(`${chalk.bold('Depth'.padStart(5))} | ${chalk.bold('RT'.padStart(7))} | ${chalk.bold('Time'.padStart(5))} | ${chalk.bold('Gas'.padEnd(12))} | ${chalk.bold('CNS%'.padStart(6))} | ${chalk.bold('OTU'.padStart(6))}`);
        console.log(chalk.gray(''.padEnd(65, '-')));

        result.schedule.forEach(s => {
            console.log(`${s.depth.toFixed(0).padStart(4)}m | ${s.run_time.toFixed(1).padStart(5)}min | ${s.time.toFixed(0).padStart(4)}min | ${s.gas.padEnd(12)} | ${s.cns.toFixed(1).padStart(5)}% | ${s.otu.toFixed(1).padStart(6)}`);
        });

        if (isCcr) {
            console.log(chalk.bold('\nOnboard Gas Requirements (Minimum for Dive):'));
            Object.entries(gasReqs.onboard).forEach(([gas, vol]) => {
                console.log(`  ${gas.padEnd(15)}: ${vol.toFixed(0).padStart(5)} L`);
            });
        }

        console.log(chalk.bold('\nBailout Gas Requirements (OC descent + deco, 1.5x Safety):'));
        Object.entries(gasReqs.bailout).forEach(([gas, vol]) => {
            console.log(`  ${gas.padEnd(15)}: ${vol.toFixed(0).padStart(5)} L`);
        });

        console.log(chalk.bold('\nOxygen Toxicity:'));
        console.log(`  CNS Clock: ${result.cns_percent.toFixed(1).padStart(6)} %`);
        console.log(`  OTUs:      ${result.otus.toFixed(1).padStart(6)}`);

        console.log(chalk.bold('\nSurface Pressure Load:'));
        console.log(`  Surface GF: ${result.surface_gf.toFixed(1).padStart(6)} %`);

        if (result.warnings.length > 0) {
            console.log(chalk.bold.red('\nSafety Warnings:'));
            result.warnings.forEach(w => console.log(chalk.red(`  !!! ${w} !!!`)));
        }

    } catch (err: any) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
    }
  });

program.parse();
