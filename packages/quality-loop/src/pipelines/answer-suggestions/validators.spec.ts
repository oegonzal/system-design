import {
  composeFieldGoal,
  DOCUMENT_MEMORY_LEGEND,
  FIELD_ANSWER_PIPELINE_ID,
  type AnswerSuggestions,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { contractOf } from '../../core/testing';
import { ANSWER_SUGGESTIONS } from './definition';
import {
  sampleEvidence,
  sampleFields,
  sampleSuggestions,
  SUGGESTING_PROSE,
  suggestionsGoal,
} from './testing';
import { citationsValidator, limitsValidator, referencesValidator } from './validators';

const contract = (goal = suggestionsGoal()) => contractOf(ANSWER_SUGGESTIONS.task, goal);

const problems = (
  validator: typeof referencesValidator,
  suggested: AnswerSuggestions,
  goal?: string,
) => validator.validate(suggested, contract(goal)).problems.map((p) => [p.locationRefs, p.message]);

describe('the answer-suggestions validators', () => {
  it('[QL-64] references block a field the form never listed, a field missed, and an alias the goal never listed', () => {
    expect(problems(referencesValidator, sampleSuggestions())).toEqual([]);
    const strayed = sampleSuggestions();
    const [cited] = strayed.fields[2]?.suggestions ?? [];
    if (cited === undefined) throw new Error('the sample suggests for its third field');
    strayed.fields[0] = { ref: 'e9', suggestions: [] };
    cited.cites = ['m7'];
    expect(problems(referencesValidator, strayed)).toEqual([
      [['field.1'], 'e9 is not a listed field'],
      [['field.3.1'], 'm7 is not listed evidence'],
      [[], 'e1 is not suggested for'],
    ]);
    expect(referencesValidator.gate).toBe('block');
  });

  it('[QL-64] citations and limits warn at the one suggestion they name, and withhold it', () => {
    const faulted = sampleSuggestions();
    const [first] = faulted.fields;
    if (first === undefined) throw new Error('the sample suggests for its first field');
    first.suggestions = [
      { text: 'six', basis: 'record', cites: [], why: 'from the record' },
      { text: '1000', basis: 'invented', cites: [], why: 'a draft' },
    ];
    expect(problems(citationsValidator, faulted)).toEqual([
      [['field.1.1'], 'e1: a record suggestion cites no evidence'],
    ]);
    expect(problems(limitsValidator, faulted)).toEqual([
      [['field.1.1'], 'e1 takes a number; "six" is not one'],
      [['field.1.2'], 'e1 takes at most 3 characters; the value runs to 4'],
    ]);
    for (const validator of [citationsValidator, limitsValidator]) {
      expect(validator.gate).toBe('warn');
      expect(validator.withholds).toBe('every-ref');
    }
    // An invented draft cites what it is modelled on, or nothing: no citation is owed.
    expect(problems(citationsValidator, sampleSuggestions())).toEqual([]);
  });

  it('[QL-64] a goal written for another form pipeline carries no index to check against', () => {
    const answerGoal = composeFieldGoal({
      pipeline: FIELD_ANSWER_PIPELINE_ID,
      prose: SUGGESTING_PROSE,
      fields: sampleFields(),
      evidence: sampleEvidence(),
      kinds: DOCUMENT_MEMORY_LEGEND,
    });
    expect(problems(referencesValidator, sampleSuggestions(), answerGoal)).toEqual([
      [[], 'the goal carries no answer-suggestions index'],
    ]);
  });
});
