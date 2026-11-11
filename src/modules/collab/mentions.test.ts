import { describe, expect, it } from 'vitest';
import { findMentions, insertMention, mentionAt, splitMentions, suggest } from './mentions';

const people = [
  { id: 'z', name: 'Zoé' },
  { id: 'a', name: 'Ann' },
  { id: 'am', name: 'Ann Marie' },
  { id: 'n', name: 'Nasty' },
];

describe('@mentions', () => {
  it('spots an @ being typed before the caret', () => {
    expect(mentionAt('Hey @Zo', 7)).toEqual({ start: 4, query: 'Zo' });
    expect(mentionAt('@', 1)).toEqual({ start: 0, query: '' });
    expect(mentionAt('mail me@home', 12)).toBeNull();
    expect(mentionAt('@Zoé done', 9)).toBeNull();
  });

  it('suggests people by name, best first', () => {
    expect(suggest(people, 'an').map((p) => p.id)).toEqual(['a', 'am']);
    expect(suggest(people, 'mar').map((p) => p.id)).toEqual(['am']);
    expect(suggest(people, '').length).toBe(4);
  });

  it('inserts the chosen name', () => {
    expect(insertMention('Hey @Zo!', { start: 4, query: 'Zo' }, people[0]!)).toEqual({ text: 'Hey @Zoé !', caret: 9 });
  });

  it('finds who is mentioned, longest names first', () => {
    expect(findMentions('Thanks @Ann Marie and @zoé.', people).sort()).toEqual(['am', 'z']);
    expect(findMentions('@Ann, look', people)).toEqual(['a']);
    expect(findMentions('@Annabel', people)).toEqual([]);
  });

  it('marks mentions in the text', () => {
    expect(splitMentions('Ask @Nasty now', people)).toEqual([{ text: 'Ask ' }, { text: '@Nasty', person: people[3] }, { text: ' now' }]);
  });
});
