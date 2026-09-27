import { diagnostics } from '../server/diagnostics.js';
import { configureQvac } from './environment.mjs';
configureQvac();
const report = await diagnostics();
console.log(JSON.stringify(report, null, 2));
if (report.blockers.length) process.exitCode = 1;
