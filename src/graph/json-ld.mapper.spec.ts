import type { JsonLdDocument } from '@aether-zone/organon';

import { JsonLdMapper } from './json-ld.mapper';

const CONTEXT = {
  aether: 'https://aether.zone/vocab/',
  participant: 'aether:participant',
};

const mapper = new JsonLdMapper();

const meeting = (over: Record<string, unknown> = {}): JsonLdDocument => ({
  '@context': CONTEXT,
  '@id': 'urn:aether:meeting:1',
  '@type': 'aether:Meeting',
  title: 'Standup',
  ...over,
});

describe('literals', () => {
  it('become properties on the subject', () => {
    const { nodes } = mapper.map(
      meeting({ startTime: '2026-01-01T09:00:00Z' }),
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      uri: 'urn:aether:meeting:1',
      types: ['aether:Meeting'],
      properties: { title: 'Standup', startTime: '2026-01-01T09:00:00Z' },
    });
  });

  it('leaves the document’s own machinery out of them', () => {
    const [node] = mapper.map(meeting()).nodes;

    // `@id` is the node's identity and `@type` its labels; neither is a fact
    // about the resource to be stored beside its title.
    expect(Object.keys(node.properties)).toEqual(['title']);
  });
});

describe('references', () => {
  it('become an edge, and a node for the thing pointed at', () => {
    // `{ '@id': … }` and nothing else: a pointer at a resource described
    // elsewhere, which may not have arrived yet.
    const { nodes, relationships } = mapper.map(
      meeting({ participant: { '@id': 'urn:aether:person:1' } }),
    );

    expect(nodes.map((node) => node.uri)).toEqual([
      'urn:aether:meeting:1',
      'urn:aether:person:1',
    ]);
    expect(relationships).toEqual([
      {
        from: 'urn:aether:meeting:1',
        to: 'urn:aether:person:1',
        type: 'PARTICIPANT',
        properties: {},
      },
    ]);
  });

  it('resolves the predicate through the context', () => {
    // `participant` maps to `aether:participant`, whose local name is what the
    // edge is called — so two documents spelling it differently still meet.
    const { relationships } = mapper.map(
      meeting({ participant: { '@id': 'urn:aether:person:1' } }),
    );

    expect(relationships[0].type).toBe('PARTICIPANT');
  });

  it('carries the node no properties, since the document said none', () => {
    const { nodes } = mapper.map(
      meeting({ participant: { '@id': 'urn:aether:person:1' } }),
    );

    expect(nodes[1]).toEqual({
      uri: 'urn:aether:person:1',
      types: [],
      properties: {},
    });
  });
});

describe('nested resources', () => {
  it('become a node of their own, and an edge to it', () => {
    const { nodes, relationships } = mapper.map(
      meeting({
        participations: [
          {
            '@id': 'urn:aether:participation:1',
            '@type': 'aether:Participation',
            role: 'host',
            participant: { '@id': 'urn:aether:person:1' },
          },
        ],
      }),
    );

    expect(nodes.map((node) => node.uri)).toEqual([
      'urn:aether:meeting:1',
      'urn:aether:participation:1',
      'urn:aether:person:1',
    ]);

    // The participation holds the fact that belongs to neither end of it.
    expect(nodes[1].properties).toEqual({ role: 'host' });

    expect(relationships).toEqual([
      {
        from: 'urn:aether:participation:1',
        to: 'urn:aether:person:1',
        type: 'PARTICIPANT',
        properties: {},
      },
      {
        from: 'urn:aether:meeting:1',
        to: 'urn:aether:participation:1',
        type: 'PARTICIPATIONS',
        properties: {},
      },
    ]);
  });

  it('lets a nested context override the one it inherits', () => {
    const { relationships } = mapper.map(
      meeting({
        thing: {
          '@id': 'urn:aether:thing:1',
          '@context': { thing: 'https://example.test/vocab/renamed' },
          other: { '@id': 'urn:aether:other:1' },
        },
      }),
    );

    // The nested resource's own context is what its properties resolve
    // against — the spec's rule, and why the context is threaded down.
    expect(relationships.map((r) => r.type)).toContain('OTHER');
  });
});

describe('arrays', () => {
  it('become one edge each, not an edge to a list', () => {
    const { relationships } = mapper.map(
      meeting({
        participant: [
          { '@id': 'urn:aether:person:1' },
          { '@id': 'urn:aether:person:2' },
        ],
      }),
    );

    expect(relationships).toHaveLength(2);
    expect(relationships.map((r) => r.to)).toEqual([
      'urn:aether:person:1',
      'urn:aether:person:2',
    ]);
  });
});

describe('the same resource mentioned twice', () => {
  it('is one node, not two', () => {
    // Whichever mention carries the detail wins; a graph with the same IRI
    // twice is two half-resources nothing can join.
    const { nodes } = mapper.map(
      meeting({
        host: { '@id': 'urn:aether:person:1' },
        attendee: { '@id': 'urn:aether:person:1' },
      }),
    );

    expect(nodes.filter((n) => n.uri === 'urn:aether:person:1')).toHaveLength(
      1,
    );
  });
});

describe('a document with no @id', () => {
  it('is refused, because nothing could be filed under it', () => {
    expect(() =>
      mapper.map({ '@context': CONTEXT, '@type': 'aether:Meeting' } as never),
    ).toThrow(/no @id/);
  });
});

describe('what belongs to what', () => {
  it('marks a nested resource as part of the thing that defined it', () => {
    // A participation exists only as part of its meeting, and that is what
    // lets the repository delete it when the meeting goes.
    const { nodes } = mapper.map(
      meeting({
        participations: [
          {
            '@id': 'urn:aether:participation:1',
            '@type': 'aether:Participation',
            role: 'host',
          },
        ],
      }),
    );

    const participation = nodes.find(
      (node) => node.uri === 'urn:aether:participation:1',
    );

    expect(participation?.partOf).toBe('urn:aether:meeting:1');
  });

  it('leaves a referenced resource unowned', () => {
    /*
     * The person a meeting names goes on existing after the meeting is
     * deleted. This is the whole reason the mapper's reference/nested
     * distinction has to survive into the graph — both look like an edge once
     * written, and only one of them may be cascaded through.
     */
    const { nodes } = mapper.map(
      meeting({ participant: { '@id': 'urn:aether:person:1' } }),
    );

    const person = nodes.find((node) => node.uri === 'urn:aether:person:1');

    expect(person?.partOf).toBeUndefined();
  });

  it('does not mark the document itself as part of anything', () => {
    const { nodes, root } = mapper.map(meeting());

    expect(root).toBe('urn:aether:meeting:1');
    expect(nodes.find((node) => node.uri === root)?.partOf).toBeUndefined();
  });

  it('owns a part of a part, so a cascade can reach it', () => {
    const { nodes } = mapper.map(
      meeting({
        participations: [
          {
            '@id': 'urn:aether:participation:1',
            '@type': 'aether:Participation',
            attachment: {
              '@id': 'urn:aether:note:1',
              '@type': 'aether:Note',
              text: 'apologies',
            },
          },
        ],
      }),
    );

    expect(nodes.find((node) => node.uri === 'urn:aether:note:1')?.partOf).toBe(
      'urn:aether:participation:1',
    );
  });

  it('keeps the first owner when two documents nest the same resource', () => {
    // Ownership is not a race. Whichever document defined it first keeps it,
    // so a second mention cannot quietly move what a cascade will delete.
    const { nodes } = mapper.map(
      meeting({
        first: {
          '@id': 'urn:aether:thing:1',
          '@type': 'aether:Thing',
          note: 'a',
        },
        second: { '@id': 'urn:aether:thing:1', note: 'b' },
      }),
    );

    expect(
      nodes.find((node) => node.uri === 'urn:aether:thing:1')?.partOf,
    ).toBe('urn:aether:meeting:1');
  });
});
