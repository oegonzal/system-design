/**
 * The five memory kinds a strategy keeps, as data, after the patterns in
 * docs/memory/memory-designing.md §3. Working state is one value per key and
 * never projected; a semantic fact is one value per subject and predicate, and
 * is where consolidated lessons are kept; an episode appends, its verified
 * lesson the evidence consolidation counts; a playbook is one current version
 * per name, its rules the lessons promoted into it; a relation is one edge per
 * subject, relation and object, so several can stand at once and one ends by
 * invalidation. Relations and working state are found by their keys, never by
 * similarity, so neither is projected.
 */
import { CANDIDATE_SCHEMAS, type CandidateOf, type RegisterKind } from '@sysdesign/contracts';

import { byText } from '../order';
import { defineBehavior, type KindBehavior } from './behavior';

/** The predicate a consolidated lesson is kept under; its subject is the lesson's key. */
export const LESSON_PREDICATE = 'lesson';

const working = defineBehavior<CandidateOf<'working'>>({
  kind: 'working',
  candidate: CANDIDATE_SCHEMAS.working,
  identity: ['key'],
  keys: ['key'],
  validFrom: null,
  projected: false,
  text(candidate) {
    return `${candidate.key}: ${candidate.value}`;
  },
});

const semantic = defineBehavior<CandidateOf<'semantic'>>({
  kind: 'semantic',
  candidate: CANDIDATE_SCHEMAS.semantic,
  identity: ['subject', 'predicate'],
  keys: ['subject'],
  validFrom: 'validFrom',
  projected: true,
  text(candidate) {
    return `${candidate.subject} — ${candidate.predicate}: ${candidate.value}`;
  },
  fromLesson(lesson) {
    return {
      subject: lesson.key,
      predicate: LESSON_PREDICATE,
      value: lesson.text,
      validFrom: null,
    };
  },
});

const episodic = defineBehavior<CandidateOf<'episodic'>>({
  kind: 'episodic',
  candidate: CANDIDATE_SCHEMAS.episodic,
  identity: [],
  keys: ['subject'],
  validFrom: 'occurredAt',
  projected: true,
  text(candidate) {
    const lesson = candidate.lesson === null ? '' : `; lesson: ${candidate.lesson.text}`;
    return `${candidate.subject} — ${candidate.situation}; ${candidate.action}; ${candidate.outcome}${lesson}`;
  },
  lessonOf(candidate) {
    return candidate.outcomeVerified ? candidate.lesson : null;
  },
});

const procedural = defineBehavior<CandidateOf<'procedural'>>({
  kind: 'procedural',
  candidate: CANDIDATE_SCHEMAS.procedural,
  identity: ['name'],
  keys: ['name'],
  validFrom: null,
  projected: true,
  text(candidate) {
    const description = candidate.description === null ? '' : ` — ${candidate.description}`;
    return `${candidate.name}${description}: ${candidate.rules.map((rule) => rule.text).join('; ')}`;
  },
  fromLessons(name, lessons) {
    const rules = [...lessons]
      .sort((a, b) => byText(a.key, b.key))
      .map((lesson) => ({ key: lesson.key, text: lesson.text }));
    return { name, description: null, rules };
  },
});

const relational = defineBehavior<CandidateOf<'relational'>>({
  kind: 'relational',
  candidate: CANDIDATE_SCHEMAS.relational,
  identity: ['subject', 'relation', 'object'],
  keys: ['subject', 'object'],
  validFrom: 'validFrom',
  projected: false,
  text(candidate) {
    return `${candidate.subject} ${candidate.relation} ${candidate.object}`;
  },
});

/** Every kind a strategy can keep, as the runtime executes it by default. */
export const DEFAULT_BEHAVIORS = {
  working,
  episodic,
  semantic,
  procedural,
  relational,
} as const satisfies Record<RegisterKind, KindBehavior>;
