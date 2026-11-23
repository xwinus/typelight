/* Shared by the desktop renderer and its formatting tests. */
(() => {
  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 });
  const exact = new Intl.NumberFormat('en-US');

  function countLabel(value, unit, abbreviated = false) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Counts must be non-negative safe integers.');
    const number = abbreviated && value >= 1000 ? compact.format(value).toLowerCase() : exact.format(value);
    return number + ' ' + unit + (value === 1 ? '' : 's');
  }

  function summarize({ words, texts, libraryWords, drawer = false }) {
    const exactWords = countLabel(words, 'word');
    const exactTexts = countLabel(texts, 'text');
    const librarySummary = exactTexts + ' · ' + countLabel(libraryWords, 'word');
    return {
      label: drawer ? countLabel(texts, 'text', true) : countLabel(words, 'word', true),
      title: drawer ? librarySummary : exactWords,
      librarySummary,
    };
  }

  const api = Object.freeze({ countLabel, summarize });
  if (typeof module !== 'undefined') module.exports = api;
  else window.typelightCounts = api;
})();
