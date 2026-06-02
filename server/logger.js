import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE = path.join(__dirname, 'debug.log');

// Clear log on startup
fs.writeFileSync(LOG_FILE, `--- LOG STARTED AT ${new Date().toISOString()} ---\n`);

/**
 * Logs a message with a precise timestamp to both console and debug.log.
 */
export function log(...args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
    const formatted = `[${timestamp}] INFO: ${message}`;
    console.log(...args);
    fs.appendFileSync(LOG_FILE, formatted + '\n');
}

export function warn(...args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
    const formatted = `[${timestamp}] WARN: ${message}`;
    console.warn(...args);
    fs.appendFileSync(LOG_FILE, formatted + '\n');
}

export function error(...args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
    const formatted = `[${timestamp}] ERROR: ${message}`;
    console.error(...args);
    fs.appendFileSync(LOG_FILE, formatted + '\n');
}

/**
 * High-resolution timers that write results to the debug.log
 */
const timers = new Map();

export function time(label) {
    timers.set(label, process.hrtime());
    log(`TIMER START: ${label}`);
}

export function timeEnd(label) {
    const start = timers.get(label);
    if (!start) return;
    
    const diff = process.hrtime(start);
    const durationMs = (diff[0] * 1000 + diff[1] / 1000000).toFixed(3);
    log(`TIMER END: ${label} - ${durationMs}ms`);
    timers.delete(label);
}

export default { log, warn, error, time, timeEnd };
