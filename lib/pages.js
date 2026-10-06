"use strict";

const SHOWN = 25000;

function pages(rows, room) {
  const groups = [];
  let size = 0;
  for (const row of rows) {
    const length = row.length + 1;
    if (groups.length === 0 || (size + length > room && groups[groups.length - 1].length > 0)) {
      groups.push([]);
      size = 0;
    }
    groups[groups.length - 1].push(row);
    size += length;
  }
  return groups.length > 0 ? groups : [[]];
}

module.exports = { SHOWN, pages };
