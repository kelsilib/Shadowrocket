import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, RAW, LOW_RATE_REGEX, SOURCES, rules, splitAI, isGoogleRule } from './update.mjs';

export function section(text, name) {
  return text.split(`[${name}]`)[1]?.split(/\n\[/)[0] ?? '';
}

function matches(line, host) {
  const [type, value] = line.split(',');
  if (type === 'DOMAIN') return host === value;
  if (type === 'DOMAIN-SUFFIX') return host === value || host.endsWith(`.${value}`);
  if (type === 'DOMAIN-KEYWORD') return host.includes(value);
  if (type === 'DOMAIN-WILDCARD') {
    const regex = value.split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*').replace(/\\\?/g, '.');
    return new RegExp(`^${regex}$`).test(host);
  }
  return false;
}

function covered(entry, entries) {
  if (entries.includes(entry)) return true;
  const [type, value] = entry.split(',');
  return ['DOMAIN', 'DOMAIN-SUFFIX'].includes(type)
    && entries.some(x => x.startsWith('DOMAIN-SUFFIX,') && matches(x, value));
}

export function check(outputs, sources) {
  const config = outputs['lazy_group.conf'];
  const groupLines = rules(section(config, 'Proxy Group'));
  const groups = new Map(groupLines.map(x => {
    const index = x.indexOf('=');
    return [x.slice(0, index).trim(), x.slice(index + 1).trim().split(',')];
  }));
  assert.equal(groups.size, groupLines.length, 'duplicate group names');
  const builtins = new Set(['PROXY', 'DIRECT', 'REJECT']);
  for (const [name, fields] of groups) {
    for (const item of fields.slice(1)) {
      if (item.includes('=')) continue;
      assert(groups.has(item) || builtins.has(item), `${name}: unknown policy ${item}`);
    }
    const selected = fields.find(x => x.startsWith('policy-select-name='))?.split('=')[1];
    if (selected) assert(fields.includes(selected), `${name}: invalid default ${selected}`);
  }
  for (const name of ['Apple TV', '低倍率节点', 'AI', '谷歌服务']) assert(groups.has(name), `missing ${name}`);
  assert.equal(groups.get('低倍率节点')[0], 'select');
  assert.deepEqual(groups.get('低倍率节点'), ['select', `policy-regex-filter=${LOW_RATE_REGEX}`]);
  const lowRate = new RegExp(LOW_RATE_REGEX);
  for (const name of ['实验 香港', '香港实验节点', '香港 0.1x', '台湾0.6x', '美国 [0.1X]', '0.6x']) assert(lowRate.test(name), `should include ${name}`);
  for (const name of ['香港 1x', '10.1x', '10.6x', '20.1x', '0.16x', '0.10x', '0.6xyz', '0a1x', '1.0.1x']) assert(!lowRate.test(name), `should exclude ${name}`);
  assert(config.includes('dns-server = 223.5.5.5,119.29.29.29,https://dns.alidns.com/dns-query#no-h3,https://doh.pub/dns-query#no-h3'));
  assert(config.includes('ipv6 = false'));
  assert(config.includes('dns-direct-system = true'));
  assert(config.includes('dns-direct-fallback-proxy = false'));
  assert(config.includes(`update-url = ${RAW}/lazy_group.conf`));
  assert(!config.includes('/rule/QuantumultX/'), 'QuantumultX rule-set still referenced');
  for (const [name, policy] of [['Apple', '苹果服务'], ['Global', 'PROXY'], ['China', 'DIRECT']]) {
    assert(config.includes(`DOMAIN-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Shadowrocket/${name}/${name}_Domain.list,${policy}`), `missing Shadowrocket DOMAIN-SET ${name}`);
    assert(config.includes(`RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Shadowrocket/${name}/${name}.list,${policy}`), `missing Shadowrocket RULE-SET ${name}`);
  }
  assert(config.includes('RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Shadowrocket/WeChat/WeChat.list,DIRECT'), 'missing Shadowrocket WeChat RULE-SET');
  assert(!/sukka|skk\.moe/i.test(config), 'unwanted Sukka reference');
  assert(!config.includes('Rule/AI.txt,AI'), 'unfiltered AI source still referenced');
  const topRules = rules(section(config, 'Rule'));
  assert.equal(topRules[0], `RULE-SET,${RAW}/rules/XiaoHongShu_Direct.list,DIRECT`);
  assert(topRules.findIndex(x => x.endsWith(',Apple TV')) < topRules.findIndex(x => x.endsWith(',苹果服务')));
  for (const line of topRules) {
    const fields = line.split(',');
    const policy = fields[0] === 'FINAL' ? fields[1] : fields[2];
    assert(groups.has(policy) || builtins.has(policy), `unknown rule policy: ${line}`);
  }
  assert.equal(topRules.at(-1), 'FINAL,PROXY');
  assert.equal(new Set(topRules).size, topRules.length, 'duplicate top-level rules');
  const ai = rules(outputs['rules/AI_NoGoogle.list']);
  const google = rules(outputs['rules/GoogleAI.list']);
  const partitions = splitAI(sources['AI.txt']);
  assert(ai.length && google.length);
  assert(!ai.some(isGoogleRule), 'Google rule remains in AI');
  assert(!ai.some(x => google.includes(x)), 'AI and Google AI share exact rules');
  for (const entry of partitions.ai) assert(covered(entry, ai), `AI source rule lost: ${entry}`);
  for (const entry of [...partitions.google, ...rules(sources['gemini.list'])]) assert(covered(entry, google), `Google source rule lost: ${entry}`);
  for (const [path, text] of Object.entries(outputs)) {
    if (!path.startsWith('rules/')) continue;
    const entries = rules(text);
    assert.equal(entries.length, new Set(entries).size, `duplicates in ${path}`);
    for (const entry of entries) assert.equal(entry.split(',').length, 2, `invalid rule: ${entry}`);
  }

  // These hostnames must match our custom rules before any inherited remote rules.
  const cases = {
    'www.xiaohongshu.com': 'DIRECT', 'edith.xiaohongshu.com': 'DIRECT',
    'www.rednote.com': 'DIRECT', 'creator.rednote.com': 'DIRECT', 'agree.rednote.com': 'DIRECT',
    'sns-web-i10.rednotecdn.com': 'DIRECT', 'sns-video-qc.xhscdn.com': 'DIRECT',
    'sns-video-hw.xhscdn.net': 'DIRECT', 'xhslink.com': 'DIRECT', 'xhslink.cn': 'DIRECT',
    'picasso-private-1251524319.cos.ap-shanghai.myqcloud.com': 'DIRECT',
    'tv.apple.com': 'Apple TV', 'uts-api.itunes.apple.com': 'Apple TV',
    'hls-amt.itunes.apple.com': 'Apple TV',
    'gemini.google.com': '谷歌服务', 'gemini.google': '谷歌服务',
    'gemini.gstatic.com': '谷歌服务', 'ai.google.dev': '谷歌服务',
    'aistudio.google.com': '谷歌服务', 'generativelanguage.googleapis.com': '谷歌服务',
    'alkalimakersuite-pa.clients6.google.com': '谷歌服务', 'notebooklm.google.com': '谷歌服务',
    'accounts.google.com': null, // Inherited Google rules, deliberately not in custom AI tests.
    'antigravity.google': '谷歌服务', 'deepmind.com': '谷歌服务',
    'chatgpt.com': 'AI', 'api.openai.com': 'AI', 'claude.ai': 'AI',
    'grok.com': 'AI', 'cursor.com': 'AI', 'githubcopilot.com': 'AI',
  };
  let scenarioCount = 0;
  for (const [host, expected] of Object.entries(cases)) {
    if (expected === null) continue;
    let actual;
    for (const line of topRules) {
      const [type, value, policy] = line.split(',');
      if (type === 'RULE-SET') {
        if (!value.startsWith(`${RAW}/`)) break;
        const path = value.slice(RAW.length + 1);
        if (rules(outputs[path]).some(rule => matches(rule, host))) { actual = policy; break; }
      } else if (matches(`${type},${value}`, host)) { actual = policy; break; }
    }
    assert.equal(actual, expected, `${host}: routing mismatch`);
    scenarioCount++;
  }
  console.log(`Passed: ${groups.size} groups, references/defaults, AI separation, low-rate boundaries, ${scenarioCount} custom routing scenarios`);
  return { groups: groups.size, customRoutingScenarios: scenarioCount, ai: ai.length, googleAI: google.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = ['lazy_group.conf', 'rules/AI_NoGoogle.list', 'rules/GoogleAI.list', 'rules/AppleTV.list', 'rules/XiaoHongShu_Direct.list'];
  const outputs = Object.fromEntries(await Promise.all(paths.map(async path => [path, await readFile(resolve(ROOT, path), 'utf8')])));
  const sources = Object.fromEntries(await Promise.all(Object.keys(SOURCES).map(async name => [name, await readFile(resolve(ROOT, 'sources', name), 'utf8')])));
  const report = check(outputs, sources);
  if (process.argv.includes('--report')) {
    await mkdir(resolve(ROOT, 'checks'), { recursive: true });
    await writeFile(resolve(ROOT, 'checks/result.json'), JSON.stringify({ ...report, nativeShadowrocketTested: false }, null, 2) + '\n');
  }
}
