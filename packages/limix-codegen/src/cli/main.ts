#!/usr/bin/env bun
import { processIo } from './io';
import { run } from './run';

process.exitCode = await run(process.argv.slice(2), processIo);
