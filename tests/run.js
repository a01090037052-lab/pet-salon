#!/usr/bin/env node
// 실행: node tests/run.js   (의존성 없음 — Node 18+ 내장 node:test 만 사용)
// 시간대는 한국(KST)으로 고정한다 — 날짜 계산이 실행하는 컴퓨터 시간대에 따라 달라지지 않게.
'use strict';
process.env.TZ = 'Asia/Seoul';
const fs = require('node:fs');
const path = require('node:path');

const dir = __dirname;
const only = process.argv.slice(2); // 예: node tests/run.js pricing
const files = fs.readdirSync(dir)
  .filter(f => f.endsWith('.test.js'))
  .filter(f => only.length === 0 || only.some(o => f.includes(o)))
  .sort();
for (const f of files) require(path.join(dir, f));
