'use client';

import {
  ENTITY_NOTE_BOUND,
  MODEL_ENTITIES_BOUND,
  MODEL_RELATIONS_BOUND,
  RELATION_KINDS,
  type CanvasGraph,
  type RelationKind,
} from '@sysdesign/contracts';
import { Button, Heading, SelectField, Stack, Text, TextField } from '@sysdesign/design-system';
import { useMemo } from 'react';

import { useCanvasStore } from '../../canvas/canvas-store-context';
import { toCanvasGraph } from '../../canvas/graph-io';
import { ModelEntityRow } from './model-entity-row';

/**
 * The data model beside the diagram: the entities the design keeps, each
 * with the node that owns it, and how they relate. Reads the store directly,
 * as the brief and narrative editors do; read-only is the store's word. A
 * model is its own part rather than nodes on the canvas because an entity's
 * relations are not requests, and a binding's path is a walk over requests.
 */
export function ModelEditor() {
  const readOnly = useCanvasStore((state) => state.readOnly);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const entities = useCanvasStore((state) => state.entities);
  const relations = useCanvasStore((state) => state.relations);
  const addEntity = useCanvasStore((state) => state.addEntity);
  const updateEntity = useCanvasStore((state) => state.updateEntity);
  const removeEntity = useCanvasStore((state) => state.removeEntity);
  const addRelation = useCanvasStore((state) => state.addRelation);
  const updateRelation = useCanvasStore((state) => state.updateRelation);
  const removeRelation = useCanvasStore((state) => state.removeRelation);
  const graph: CanvasGraph = useMemo(() => toCanvasGraph(nodes, edges), [nodes, edges]);
  const nameOf = (id: string) => entities.find((entity) => entity.id === id)?.name || id;

  return (
    <Stack gap={5}>
      <Text size="sm" tone="muted">
        Name the entities the system keeps, who owns each, what identifies it, the rules it must
        hold and the states it moves through — then how they relate. The model critic reads this
        against your diagram; a store that owns nothing and an entity nothing owns are both
        findings.
      </Text>

      <Stack gap={3}>
        <Heading level={3}>Entities</Heading>
        {entities.map((entity) => (
          <ModelEntityRow
            key={entity.id}
            entity={entity}
            graph={graph}
            disabled={readOnly}
            onChange={(patch) => updateEntity(entity.id, patch)}
            onRemove={() => removeEntity(entity.id)}
          />
        ))}
        <div>
          <Button
            size="sm"
            variant="subtle"
            disabled={readOnly || entities.length >= MODEL_ENTITIES_BOUND.target}
            data-testid="model-entity-add"
            onClick={addEntity}
          >
            Add an entity
          </Button>
        </div>
      </Stack>

      <Stack gap={3}>
        <Heading level={3}>Relations</Heading>
        {entities.length < 2 ? (
          <Text size="sm" tone="muted">
            Name two entities, then say how they relate.
          </Text>
        ) : null}
        {relations.map((relation, index) => (
          <Stack
            // Relations have no id of their own: positional rows, re-keyed on removal.
            // eslint-disable-next-line @eslint-react/no-array-index-key
            key={index}
            direction="row"
            gap={2}
            align="end"
            wrap
            data-testid={`model-relation-${index}`}
          >
            <SelectField
              label="From"
              data-testid={`model-relation-${index}-from`}
              value={relation.from}
              disabled={readOnly}
              onChange={(event) => updateRelation(index, { from: event.target.value })}
            >
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {nameOf(entity.id)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Relation"
              data-testid={`model-relation-${index}-kind`}
              value={relation.kind}
              disabled={readOnly}
              onChange={(event) =>
                updateRelation(index, { kind: event.target.value as RelationKind })
              }
            >
              {RELATION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="To"
              data-testid={`model-relation-${index}-to`}
              value={relation.to}
              disabled={readOnly}
              onChange={(event) => updateRelation(index, { to: event.target.value })}
            >
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {nameOf(entity.id)}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Note"
              data-testid={`model-relation-${index}-note`}
              value={relation.note ?? ''}
              maxLength={ENTITY_NOTE_BOUND.ceiling}
              target={ENTITY_NOTE_BOUND.target}
              placeholder="optional"
              disabled={readOnly}
              onChange={(event) => updateRelation(index, { note: event.target.value })}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={readOnly}
              data-testid={`model-relation-${index}-remove`}
              onClick={() => removeRelation(index)}
            >
              Remove
            </Button>
          </Stack>
        ))}
        <div>
          <Button
            size="sm"
            variant="subtle"
            disabled={
              readOnly || entities.length < 2 || relations.length >= MODEL_RELATIONS_BOUND.target
            }
            data-testid="model-relation-add"
            onClick={() =>
              addRelation({ from: entities[0].id, to: entities[1].id, kind: 'one-to-many' })
            }
          >
            Add a relation
          </Button>
        </div>
      </Stack>
    </Stack>
  );
}
