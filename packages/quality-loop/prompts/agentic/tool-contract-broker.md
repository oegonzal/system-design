# Prompt — Let agents call each other's tools without knowing each other

**Archetype:** agentic-workflow · **Difficulty:** hard

## Scenario

A team's agents have grown tools: one extracts entities from a document, one runs a migration, one queries a warehouse, one summarises a diff. Each was written by a different person for a different workflow, and each is now wanted by workflows its author never imagined. Today an agent that wants another's tool has the call hard-coded into its prompt, so a change to the tool's arguments breaks callers silently — the agent simply produces a worse answer, and nobody finds out for a week. Worse, two versions of the same tool now exist and callers cannot say which they are bound to. The team wants a broker: tools publish what they accept and return, callers ask for a capability rather than a name, and an incompatible pairing is refused before an agent is spawned rather than discovered mid-flow. Design the broker.

## Capabilities

1. The broker serves workflows over arbitrary input strings and matches callers to tools with no rule that reads the brief, no per-domain catalogue, and no list of the workflows it expects to serve.
2. A tool publishes a declaration of the capability it offers, what it accepts, what it returns and what it guarantees on failure; publishing a tool requires no change to the broker.
3. A caller asks for a capability and the shape it needs, never for a tool by name, so a tool can be replaced by another that offers the same capability.
4. Several tools may offer one capability, and the broker chooses between them by stated rules over declared attributes — cost, latency, confidence — rather than by order of registration.
5. A caller and a tool whose declarations do not fit are refused before any process is spawned, with a stated reason naming the incompatibility.
6. More than one version of a capability may exist at once, and a caller is bound to a version explicitly rather than by whichever was published last.
7. Retiring a version reports which callers still depend on it before it can complete, and never breaks a run already in flight.
8. A tool that fails, times out or returns something its own declaration forbids is reported to the caller as a stated failure, never as an empty success.
9. For any call the record shows the capability asked for, the candidates considered, the rule that chose, and the version bound.

## Interfaces that must hold

1. A tool's declaration is validated when it is published, so every caller may assume that what the broker offers is structurally consistent with what the tool will actually accept.
2. A caller states a capability and a required shape; the broker hands back a binding it may assume is compatible, or a refusal naming the incompatibility — never a best-effort match it has to check itself.
3. A tool's answer crosses back conforming to its declared return shape, or as a stated failure in the same envelope, so a caller never has to distinguish an empty result from a broken one by inspecting it.
4. Retirement of a version crosses to dependents as a notice they can act on before the version disappears; a run already bound keeps its binding until it ends.

## Properties

| Property      | What it must mean here                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------- |
| extensibility | A new tool, or a new version of one, is a declaration; the broker never changes to admit it     |
| determinism   | The same request against the same published set binds the same tool and version                 |
| degradation   | A tool being unavailable yields a stated refusal or an alternative, never a silent empty answer |
| auditability  | Every binding is explainable afterwards from the record alone                                   |

## Constraints

- Tools are written by people who never read the broker's code, so a malformed declaration must be refused at publication with a stated reason rather than failing at call time.
- The set of capabilities is open and grows constantly; nothing may hold an enumeration of the capabilities that exist.
- An agent process is expensive to start, so an incompatibility must be found before one is spawned, not after it returns.
