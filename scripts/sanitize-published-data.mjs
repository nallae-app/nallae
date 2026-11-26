import {sanitizePublishedData} from './lib/published-scope.mjs';
sanitizePublishedData(process.argv[2] || 'web/data');
console.log('Published data scope: local-life-v1');
