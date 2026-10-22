import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateTypes } from '../src/generate_types';
import { PRODUCTION_SCHEMAS } from '../src/index';

const target = join(import.meta.dirname, '..', 'src', 'generated', 'card_types.ts');
writeFileSync(target, generateTypes(PRODUCTION_SCHEMAS));
process.stdout.write(`wrote ${target}\n`);
