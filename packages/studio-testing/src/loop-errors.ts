import type { Diagnostic, LlmModelDto } from '@sysdesign/contracts';

/**
 * What the fake loop throws, and the whole of it. These are the three
 * refusals a caller must tell apart — nobody answered, somebody answered no,
 * and a derivation yielded no rubric — and each adapter over the fake maps
 * them onto the exceptions the real HTTP client would raise. They live apart
 * from the state machine because their reason to change is the client's error
 * contract, not the loop's behaviour.
 */

/** The loop's socket is dead: the adapter answers as the real client would to no answer at all. */
export class LoopUnreachable extends Error {
  constructor() {
    super('the quality loop is unreachable: fake');
    this.name = 'LoopUnreachable';
  }
}

/** The loop answered, and refused. */
export class LoopRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'LoopRefused';
  }

  get body(): { statusCode: number; message: string } {
    return { statusCode: this.status, message: this.message };
  }
}

/** A derivation yielded no rubric — the loop's 503, never an empty list. */
export class DerivationFailed extends Error {
  constructor(
    message: string,
    readonly llm: LlmModelDto,
    readonly diagnostic: Diagnostic | null,
  ) {
    super(message);
    this.name = 'DerivationFailed';
  }
}
