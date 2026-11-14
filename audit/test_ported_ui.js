const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const elements = new Map();
const downloads = [];
let pendingDownloadText = Promise.resolve('');

function makeElement(tag = 'div') {
  return {
    tagName: tag,
    style: {},
    attributes: {},
    children: [],
    disabled: false,
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener() {},
    click() { downloads.push(this); },
    remove() {},
  };
}

const document = {
  body: makeElement('body'),
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeElement());
    return elements.get(id);
  },
  createElement: makeElement,
  querySelectorAll() { return []; },
};
const window = { setTimeout() {} };
const URLApi = {
  createObjectURL(blob) { pendingDownloadText = blob.text(); return 'blob:test-report'; },
  revokeObjectURL() {},
};

let source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.match(source, /\nstart\(\);\s*$/m, 'app entry point should remain a classic-script call');
source = source.replace(/\nstart\(\);\s*$/m, '');
source += '\nglobalThis.__testApi = { state, updateControls, answerDetectiveQuestion, exportTrendReport, renderMethodology, renderDemoStep, narrateDemoStep, toggleDemoNarration, stopDemoNarration, parseGlobalCsv };';
const context = { document, window, URL: URLApi, Blob, console, Float32Array, Math, Number, Map };
vm.runInNewContext(source, context, { filename: 'app.js' });
const api = context.__testApi;
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'data', 'grid-metadata.json'), 'utf8'));
const csv = fs.readFileSync(path.join(root, 'data', 'global-mean.csv'), 'utf8');
api.state.meta = metadata;
api.state.globalSeries = api.parseGlobalCsv(csv);
api.state.region = 'global';
api.state.start = 2000;
api.state.end = 2025;

api.updateControls();
assert.equal(elements.get('start-year').max, 2018, 'start thumb must leave at least eight annual values');
assert.equal(elements.get('end-year').min, 2007, 'end thumb must leave at least eight annual values');
assert.equal(elements.get('start-year').attributes['aria-valuetext'], 'Start year 2000');
assert.equal(elements.get('end-year').attributes['aria-valuetext'], 'End year 2025');

const result = api.answerDetectiveQuestion('Summarize this trend');
assert.match(result, /GLOBAL MEAN/);
assert.match(result, /2000–2025/);
assert.match(result, /Mann–Kendall p =/);
assert.match(api.answerDetectiveQuestion('What does the p-value mean?'), /no-monotonic-trend null/);
assert.match(api.answerDetectiveQuestion('Do you have a confidence interval?'), /does not calculate confidence intervals/i);
assert.match(api.answerDetectiveQuestion('Tell me tomorrow’s weather'), /cannot answer that from the loaded dataset/i);

api.renderMethodology();
assert.ok(elements.get('method-content').children.length >= 6, 'provenance tab must populate dataset metadata facts');
assert.ok(elements.get('method-content').children.some((card) => /MISSING VALUE SENTINEL/.test(card.children[0].textContent)));
api.renderMethodology('math');
assert.ok(elements.get('method-content').children.some((card) => /MANN-KENDALL TEST/.test(card.children[0].textContent)));
api.renderMethodology('spatial');
assert.ok(elements.get('method-content').children.some((card) => /COSINE-LATITUDE/.test(card.children[0].textContent)));
api.renderMethodology('limitations');
assert.ok(elements.get('method-content').children.some((card) => /CAUSALITY BOUNDARY/.test(card.children[0].textContent)));

api.state.demo = { tag: 'DEMO', steps: [['Text step', 'Readable step text']] };
api.state.demoStep = 0;
api.renderDemoStep();
assert.equal(elements.get('demo-body').textContent, 'Readable step text');
assert.equal(elements.get('demo-speech-toggle').disabled, true, 'speech control must be disabled when speech synthesis is unavailable');

const speechState = { speaking: false, paused: false, utterance: null, speak(utterance) { this.speaking = true; this.utterance = utterance; utterance.onstart?.(); }, pause() { this.paused = true; }, resume() { this.paused = false; }, cancel() { this.speaking = false; this.paused = false; } };
class MockUtterance { constructor(text) { this.text = text; } }
context.window.speechSynthesis = speechState;
context.window.SpeechSynthesisUtterance = MockUtterance;
context.SpeechSynthesisUtterance = MockUtterance;
api.renderDemoStep();
api.narrateDemoStep();
assert.equal(speechState.speaking, true, 'guided step can start speech narration');
assert.match(speechState.utterance.text, /Readable step text/);
api.toggleDemoNarration();
assert.equal(speechState.paused, true, 'guided narration can pause');
api.toggleDemoNarration();
assert.equal(speechState.paused, false, 'guided narration can resume');
api.stopDemoNarration();
assert.equal(speechState.speaking, false, 'guided narration is cancelled on exit');

api.exportTrendReport();
pendingDownloadText.then((report) => {
  assert.match(report, /NASA GISS GISTEMP/);
  assert.match(report, /2000–2025/);
  assert.match(report, /Confidence interval: Not calculated/);
  assert.match(report, /Mann–Kendall p-value/);
  assert.equal(downloads.at(-1).download, 'earth-trend-report-global-2000-2025.md');
  console.log('PASS: year bounds, accessible labels, deterministic answers, methodology metadata, speech start/pause/resume/exit and fallback, and trend-report fields');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
