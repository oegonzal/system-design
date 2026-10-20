# Turn an uploaded video into every format a player asks for

**Archetype:** media-pipeline · **Difficulty:** standard

## Scenario

A creator platform accepts video uploads of anything from thirty seconds to four hours. Each upload must become a set of renditions at different resolutions and bitrates, plus a thumbnail sheet and a caption track, before viewers can play it. Transcoding a long file takes tens of minutes of machine time, and the machines are expensive, so the platform buys interruptible capacity that the cloud provider reclaims with two minutes' notice. Creators on the paid tier expect their uploads processed ahead of the free tier's backlog. Some files are malformed in ways that make the encoder hang or crash, and a handful of those have previously consumed a whole fleet retrying forever. When every rendition is ready the video is published and the creator is notified. Design the service that runs this work.

## Functional requirements

1. An accepted upload becomes a set of renditions, a thumbnail sheet and a caption track, and is published only when all of them exist.
2. A paid creator's upload is processed ahead of free-tier uploads already waiting.
3. Work interrupted by a reclaimed machine resumes without restarting the whole file from the beginning.
4. A file that repeatedly fails is set aside for inspection rather than retried indefinitely.
5. A creator can see where their upload is in the pipeline and roughly how long remains.
6. Re-running the pipeline over an already processed upload produces the same renditions without duplicating stored output.

## Non-functional requirements

| Kind         | Requirement                                               | Target                    |
| ------------ | --------------------------------------------------------- | ------------------------- |
| latency      | A short upload is playable soon after it lands            | p90 ≤ 4 min for ≤ 5 min   |
| availability | Uploads keep being accepted while workers are unavailable | 99.9% for accept          |
| durability   | An accepted upload is never lost before publication       | zero accepted loss        |
| cost         | Interruptible capacity carries most of the work           | ≥ 80% of machine minutes  |
| correctness  | A published video has every rendition it claims           | zero partial publications |
| security     | An unpublished upload is readable only by its creator     | zero cross-creator reads  |

## Scale targets

| Metric                | Target    |
| --------------------- | --------- |
| Uploads/day           | 120,000   |
| Peak uploads/hour     | 20,000    |
| Median duration       | 6 minutes |
| Renditions per upload | 5         |
| Stored output         | 4 PB      |

## Constraints

- The interruptible machines are reclaimed with two minutes' warning and no guarantee of replacement capacity for some minutes afterwards.
- The encoder is a third-party binary that cannot be modified, occasionally hangs without exiting, and reports progress only on standard error.
