# Prompt — Turn anything someone sends into one work object

**Archetype:** agentic-workflow · **Difficulty:** hard

## Scenario

Work arrives at a team from everywhere: a markdown design document, a pasted meeting transcript, a ticket with three comments and an attachment, an email thread with the actual request in the fourth reply, a bare sentence in a chat. Downstream, every workflow the team runs wants the same thing — a work object with a goal, whatever context came with it, and whatever the sender expected back. Today each entry point does its own conversion, badly and differently, and the workflows have grown defensive code for the shapes they have seen. The team wants one intake that turns any inbound artifact into that canonical object. The requirement they care about most is that the intake must not become a catalogue of formats: the next thing someone sends will be a format nobody listed. Design the intake.

## Capabilities

1. The intake accepts an arbitrary input string and produces one canonical work object from it, with no rule that matches formats, keys off structure in the text, or holds a registry of the kinds it knows.
2. The canonical object separates what is being asked for from the material supplied as context, so downstream workflows never have to guess which is which.
3. What the sender expects back is captured when it can be established and recorded as unstated when it cannot, never invented.
4. Material the intake could not place is carried through rather than discarded, so nothing sent is lost by being unrecognised.
5. The intake states its confidence in the object it produced, and that confidence travels with the object.
6. An object the intake is not confident about is still produced and still usable, with the uncertainty visible rather than the intake refusing.
7. The same inbound artifact produces the same work object, so a resend does not become a second, different piece of work.
8. A sender may correct an object after the fact, and the correction supersedes the derived version without erasing what was derived.
9. For any object the record shows what arrived, what was derived from it, and what was left unplaced.

## Interfaces that must hold

1. Whatever receives an artifact hands the normaliser bytes and nothing else — no pre-classification, no format hint — so a new source of work needs no change on either side of the boundary.
2. The normaliser hands downstream one canonical object whose goal and context are separated, and every workflow may assume that separation without re-deriving it.
3. Confidence and anything left unplaced cross the boundary attached to the object, so a consumer that ignores them is making a visible choice rather than an accidental one.
4. A correction from a sender crosses through the same boundary as an original artifact and supersedes the derived object, so there is one path in and one notion of current.

## Properties

| Property     | What it must mean here                                                                     |
| ------------ | ------------------------------------------------------------------------------------------ |
| generality   | An inbound shape nobody anticipated is handled without a code change                       |
| idempotence  | The same artifact arriving twice yields the same object, not a second piece of work        |
| honesty      | What could not be established is marked unstated rather than filled with a plausible guess |
| traceability | Every derived object resolves to the bytes that arrived and shows what went unplaced       |

## Constraints

- The inbound artifact is an opaque string. Nothing may branch on its formatting, its headings, its length, or a list of expected senders and formats.
- The most important content is often not at the start, so nothing may assume position carries meaning.
- Losing material is worse than failing to interpret it: anything not understood must survive into the object rather than be dropped.
