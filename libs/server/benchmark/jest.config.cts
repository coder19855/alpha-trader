import { readFileSync } from 'fs';

const swcrc = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

export default {
  displayName: '@alpha-trader/server-benchmark',
  preset: '../../../jest.preset.js',
  passWithNoTests: true,
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcrc],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};