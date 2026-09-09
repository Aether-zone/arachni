# arachni

The knowledge graph for aether-zone. It subscribes to the shared exchange,
flattens the JSON-LD each Aether event carries, and projects it into Neo4j.

arachni publishes nothing and exposes almost no HTTP surface. It listens.

## What it does with an event

```
akouo ──meeting.created──▶ aether-zone exchange ──▶ arachni.events queue
                                                          │
                                     aetherEventSchema ────┤ not an Aether event? drop
                                                          │
                                        JsonLdMapper ─────┤ nodes + relationships
                                                          │
                                      GraphRepository ────▶ Neo4j
```

It subscribes to **`#`** — every routing key — and decides from the event
itself, not from the key, what to do. A service that had to be told about
`meeting.created` before it could store a meeting would need changing every
time another service learned to announce something, and that is precisely the
coupling a shared vocabulary exists to remove.

| event type | what happens |
| --- | --- |
| `aether:ResourceCreated` | the document is projected |
| `aether:ResourceUpdated` | the same, merged over what is there |
| `aether:ResourceDeleted` | the resource and its edges are removed |

## How a document becomes a graph

`JsonLdMapper` decides, for each property, whether it is a **literal** the
subject holds or an **edge** to another resource. Those look identical in JSON
until you look at the shape of the value:

| in the document | in the graph |
| --- | --- |
| `"title": "Standup"` | a property on the node |
| `"participant": { "@id": "urn:…" }` | an edge to a node that may not exist yet |
| `"participations": [ { "@id": "urn:…", "role": "host" } ]` | a node of its own, and an edge to it |

A predicate is resolved through the `@context` and reduced to its local name,
so `aether:participant` and `https://aether.zone/vocab/participant` both become
a `PARTICIPANT` edge — two documents spelling the same predicate differently
still meet.

## Two rules that run through every query

**`organizationId` is on the node, not implied by the connection.** One Neo4j
holds every tenant's graph, so a query that forgot it would read across the
boundary. Every match carries it, and an event that does not state one is
dropped rather than filed under a guess.

**Writes `MERGE` on the IRI rather than `CREATE`.** At-least-once is what the
broker offers, and two documents can mention the same resource. Merging makes a
redelivery a no-op and lets whichever document arrives second fill in a node the
first only pointed at.

## Failure

A message that is not a valid Aether event is dropped, not requeued — it will
not become valid on a second reading, and requeuing something that can never
succeed is a loop that takes the queue down with it. A *write* that fails is
requeued, because the store may simply be down and the write is idempotent.

The queue is named and durable. An anonymous queue is exclusive and vanishes
with the process, so a restart would lose whatever arrived meanwhile.

## Running it

```sh
pnpm install
cp .env.example .env      # then set NEO4J_PASSWORD
pnpm build && pnpm start  # or: pnpm start:dev
```

It needs the workspace's Neo4j and RabbitMQ, both from the root
`docker-compose.yml`:

```sh
docker compose up -d neo4j rabbitmq
```

Note the ports. The compose file remaps both away from their defaults, because
7687 and 5672 are commonly taken: **Neo4j Bolt is on 7387** and **RabbitMQ on
5682**. The Neo4j browser is at <http://localhost:7374>.

APOC is required — `apoc.create.addLabels` is what turns a document's `@type`
into Neo4j labels — and the compose file enables it.

## Commands

```sh
pnpm build
pnpm start          # node dist/main.js
pnpm start:dev      # nest start --watch
pnpm test
pnpm typecheck
pnpm lint
```

## Seeing the graph

```cypher
MATCH (n:Resource) RETURN n LIMIT 50;

MATCH (m:Meeting)-[:PARTICIPATIONS]->(p:Participation)-[:PARTICIPANT]->(person)
RETURN m.title, person.uri;
```
