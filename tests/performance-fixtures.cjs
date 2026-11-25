'use strict';

const CASES = {
  small: { characters: 10000, documents: 10, drawerCharacters: 2000 },
  novel: { characters: 600000, documents: 200, drawerCharacters: 20000 },
  stress: { characters: 2000000, documents: 500, drawerCharacters: 40000 },
  paragraph: { characters: 600000, documents: 200, drawerCharacters: 20000, singleParagraph: true },
};

function writing(length, label = 'Draft') {
  if (!Number.isSafeInteger(length) || length < 0) throw new TypeError('Invalid fixture length.');
  const paragraph = `${label}: Život u řeky. The quiet writer keeps a careful record of each evening. ` +
    'There is time to read, revise a paragraph, and begin another page. 🐎\n';
  return paragraph.repeat(Math.ceil(length / paragraph.length)).slice(0, length);
}

function fixture(name) {
  const spec = CASES[name];
  if (!spec) throw new Error('Unknown performance case: ' + name);
  const text = spec.singleParagraph ? writing(spec.characters).replaceAll('\n', ' ') : writing(spec.characters);
  const pile = Array.from({ length: spec.documents }, (_, index) => ({
    id: 'fixture-' + index, title: 'Draft ' + index, at: 1700000000000 + index,
    text: writing(spec.drawerCharacters, 'Draft ' + index),
  }));
  return { spec, text, values: {
    'typelight.text': text, 'typelight.title': 'Active performance draft',
    'typelight.edited': '1700000000000',
    'typelight.document': JSON.stringify({ id: 'active', anchor: text.length, caret: text.length, view: text.length }),
    'typelight.prefs': JSON.stringify({ sound: true, volume: 0 }),
    'typelight.drawer': JSON.stringify({ v: 1, pile, bin: [] }),
  } };
}

function summary(samples) {
  if (!Array.isArray(samples) || !samples.length || samples.some(n => !Number.isFinite(n) || n < 0)) {
    throw new TypeError('Expected nonnegative timing samples.');
  }
  const sorted = samples.slice().sort((a, b) => a - b);
  const percentile = p => +sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)].toFixed(1);
  return { count: samples.length, p50: percentile(.5), p95: percentile(.95), max: percentile(1) };
}

module.exports = { CASES, writing, fixture, summary };
