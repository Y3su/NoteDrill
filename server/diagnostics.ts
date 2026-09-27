import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Diagnostics } from '../shared/domain.js';
import { cacheDirectory } from '../scripts/environment.mjs';
const exec = promisify(execFile);
export async function diagnostics(): Promise<Diagnostics> {
  const report: Diagnostics = { platform: `${os.platform()}-${os.arch()}`, node: process.versions.node, availableMemory: process.availableMemory?.() || os.freemem(), cacheDirectory, blockers: [], warnings: [] };
  if (process.platform === 'win32') {
    try {
      const { stdout } = await exec('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/vulkan.ps1')], { timeout: 20000, windowsHide: true });
      report.vulkan = stdout.trim();
      const [major, minor] = report.vulkan.split('.').map(Number);
      if (!major || major < 1 || (major === 1 && minor < 4)) report.warnings.push(`Vulkan ${report.vulkan} detected. QVAC documents Vulkan 1.4+ as required on Windows, including CPU mode. This driver is below the supported requirement; CPU loading may still work. Update your GPU vendor driver if loading fails.`);
    } catch { report.blockers.push('Vulkan could not be detected. Install your GPU vendor’s current driver with Vulkan 1.4 support, restart Windows, then retry.'); }
  }
  if (report.availableMemory < 4 * 1024 ** 3) report.warnings.push('Less than 4 GB of memory is currently available. Close other apps before loading the 4B model.');
  if (!['win32', 'linux', 'darwin'].includes(process.platform)) report.blockers.push('This desktop app supports Windows, Linux and macOS.');
  return report;
}
