import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, RAW, rules } from './update.mjs';
import { section } from './check.mjs';

const config = await readFile(resolve(ROOT, 'lazy_group.conf'), 'utf8');
const urls = [...new Set(rules(section(config, 'Rule')).filter(x => x.startsWith('RULE-SET,')).map(x => x.split(',')[1]))];
const results = [];
const downloaded = {};
let next = 0;
await Promise.all(Array.from({ length: 5 }, async () => {
  while (next < urls.length) {
    const url = urls[next++];
    let text;
    if (url.startsWith(`${RAW}/`)) {
      text = await readFile(resolve(ROOT, url.slice(RAW.length + 1)), 'utf8');
    } else {
      let lastError;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          text = await response.text();
          break;
        } catch (error) { lastError = error; }
      }
      if (text === undefined) throw new Error(`${url}: ${lastError}`);
    }
    assert(text.length > 0 && !/^\s*</.test(text), `${url}: empty or HTML response`);
    const entries = rules(text);
    assert(entries.length > 0, `${url}: no rules`);
    const types = [...new Set(entries.map(x => x.split(',')[0]))];
    assert(entries.every(x => x.includes(',')), `${url}: malformed rules`);
    downloaded[url] = entries;
    results.push({ url, rules: entries.length, types, source: url.startsWith(`${RAW}/`) ? 'local generated' : 'remote HTTP 200' });
  }
}));

// Resolve domain rules in the complete inherited chain; no DNS/network traffic to services.
function matches(entry, host) {
  const [type, value] = entry.split(',');
  if (['DOMAIN', 'HOST'].includes(type)) return host === value;
  if (['DOMAIN-SUFFIX', 'HOST-SUFFIX'].includes(type)) return host === value || host.endsWith(`.${value}`);
  if (['DOMAIN-KEYWORD', 'HOST-KEYWORD'].includes(type)) return host.includes(value);
  if (type === 'DOMAIN-WILDCARD') {
    const escaped = [...value].map(char => char === '*' ? '.*' : char === '?' ? '.' : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
    return new RegExp(`^${escaped}$`).test(host);
  }
  return false;
}
const cases = {
  'accounts.google.com': '谷歌服务', 'www.google.com': '谷歌服务',
  'youtube.com': 'YouTube', 'www.netflix.com': 'Netflix', 'www.disneyplus.com': 'Disney+',
  'www.xiaohongshu.com': 'DIRECT', 'creator.rednote.com': 'DIRECT', 'sns-webpic-qc.rednotecdn.com': 'DIRECT',
  'gemini.google.com': '谷歌服务', 'generativelanguage.googleapis.com': '谷歌服务',
  'chatgpt.com': 'AI', 'claude.ai': 'AI', 'tv.apple.com': 'Apple TV',
};
const chain = rules(section(config, 'Rule'));
for (const [host, expected] of Object.entries(cases)) {
  let actual;
  for (const line of chain) {
    const [type, value, policy] = line.split(',');
    if (type === 'RULE-SET') {
      if (downloaded[value].some(entry => matches(entry, host))) { actual = policy; break; }
    } else if (matches(`${type},${value}`, host)) { actual = policy; break; }
    else if (type === 'FINAL') { actual = value; break; }
  }
  assert.equal(actual, expected, `${host}: full-chain routing mismatch`);
}
await mkdir(resolve(ROOT, 'checks'), { recursive: true });
await writeFile(resolve(ROOT, 'checks/remote-resources.json'), JSON.stringify({
  resources: results.sort((a, b) => a.url.localeCompare(b.url)),
  fullChainDomainScenarios: Object.keys(cases).length,
  nativeShadowrocketTested: false,
}, null, 2) + '\n');
console.log(`Passed: ${urls.length} rule resources (${results.filter(x => x.source.startsWith('remote')).length} remote HTTP 200), ${Object.keys(cases).length} full-chain domain scenarios`);
