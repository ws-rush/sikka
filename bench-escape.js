const str = 'This is a "test" <string> with & characters and \'quotes\'';
const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeRegex(v) {
  return /[&<>"']/.test(v) ? v.replace(/[&<>"']/g, ch => ESCAPE_MAP[ch]) : v;
}

function escapeString(str) {
  let escape;
  let html = '';
  let lastIndex = 0;
  let index = 0;

  for (; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escape = '&quot;';
        break;
      case 38: // &
        escape = '&amp;';
        break;
      case 39: // '
        escape = '&#39;';
        break;
      case 60: // <
        escape = '&lt;';
        break;
      case 62: // >
        escape = '&gt;';
        break;
      default:
        continue;
    }

    if (lastIndex !== index) {
      html += str.substring(lastIndex, index);
    }

    lastIndex = index + 1;
    html += escape;
  }

  return lastIndex !== 0 ? html + str.substring(lastIndex, index) : str;
}

console.time('regex');
for (let i = 0; i < 1000000; i++) {
  escapeRegex(str);
}
console.timeEnd('regex');

console.time('charcode');
for (let i = 0; i < 1000000; i++) {
  escapeString(str);
}
console.timeEnd('charcode');