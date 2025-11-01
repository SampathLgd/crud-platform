// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/tests/**/*.test.ts'], // Look for tests in this folder
  // setupFilesAfterEnv: ['./src/tests/setup.ts'], // <-- DELETE THIS LINE
  forceExit: true, // (Helps ensure tests close properly)
};