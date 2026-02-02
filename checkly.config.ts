import { defineConfig } from 'checkly';
import { Frequency } from 'checkly/constructs';

export default defineConfig({
  projectName: 'Cytario Web',
  logicalId: 'cytario-web',
  checks: {
    frequency: Frequency.EVERY_10M,
    locations: ['eu-west-1'],
    tags: ['cytario'],
    runtimeId: '2025.04',
    browserChecks: {
      testMatch: './e2e/**/*.spec.ts',
    },
  },
  cli: {
    runLocation: 'eu-west-1',
  },
});
