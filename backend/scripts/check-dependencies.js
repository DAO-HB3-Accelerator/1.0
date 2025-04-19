const fs = require('fs');
const path = require('path');

const packageJson = require('../package.json');
const dependencies = packageJson.dependencies || {};

const requiredDependencies = ['express-rate-limit', 'winston', 'helmet', 'csurf'];

const missingDependencies = requiredDependencies.filter((dep) => !dependencies[dep]);

if (missingDependencies.length > 0) {
  console.error('Missing dependencies:', missingDependencies);
  console.error('Please install them with: yarn add ' + missingDependencies.join(' '));
  process.exit(1);
}

console.log('All required dependencies are installed.');
