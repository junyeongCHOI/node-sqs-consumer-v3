import type { Config } from 'jest';

const config: Config = {
    clearMocks: true,
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/__tests__'],
    collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/__tests__/**'],
    moduleFileExtensions: ['ts', 'js', 'json', 'node'],
};

export default config;
