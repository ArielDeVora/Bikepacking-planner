import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('handles quotes, commas, line breaks and blank lines', () => {
    expect(parseCsv('﻿Title,Note,URL\r\n"Café, Lyon","Say ""hi""\nthere",https://x\n\n,,\nB,,')).toEqual([
      ['Title', 'Note', 'URL'],
      ['Café, Lyon', 'Say "hi"\nthere', 'https://x'],
      ['B', '', ''],
    ]);
  });
});
