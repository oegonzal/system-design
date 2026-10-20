'use client';

import {
  ENTITY_FIELDS_BOUND,
  ENTITY_INVARIANTS_BOUND,
  ENTITY_NAME_BOUND,
  ENTITY_NOTE_BOUND,
  ENTITY_STATES_BOUND,
  type CanvasGraph,
  type ModelEntity,
} from '@sysdesign/contracts';
import {
  Badge,
  Button,
  SelectField,
  Stack,
  Surface,
  Text,
  TextField,
} from '@sysdesign/design-system';

export interface ModelEntityRowProps {
  entity: ModelEntity;
  graph: CanvasGraph;
  disabled: boolean;
  onChange: (patch: Partial<Omit<ModelEntity, 'id'>>) => void;
  onRemove: () => void;
}

/** A list of short texts — invariants, states — each row a field, with add and remove. */
function TextList({
  label,
  items,
  bound,
  max,
  testId,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  items: readonly string[];
  bound: { target: number; ceiling: number };
  max: number;
  testId: string;
  placeholder: string;
  disabled: boolean;
  onChange: (items: string[]) => void;
}) {
  return (
    <Stack gap={1} role="group" aria-label={label}>
      <Text as="span" size="sm" tone="secondary">
        {label}
      </Text>
      {items.map((item, index) => (
        <Stack
          // Items have no id of their own: positional rows, re-keyed on removal, every field controlled.
          // eslint-disable-next-line @eslint-react/no-array-index-key
          key={index}
          direction="row"
          gap={2}
          align="end"
        >
          <TextField
            label={`${label} ${index + 1}`}
            data-testid={`${testId}-${index}`}
            value={item}
            maxLength={bound.ceiling}
            target={bound.target}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(event) =>
              onChange(items.map((text, at) => (at === index ? event.target.value : text)))
            }
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            data-testid={`${testId}-${index}-remove`}
            onClick={() => onChange(items.filter((_, at) => at !== index))}
          >
            Remove
          </Button>
        </Stack>
      ))}
      <div>
        <Button
          size="sm"
          variant="subtle"
          disabled={disabled || items.length >= max}
          data-testid={`${testId}-add`}
          onClick={() => onChange([...items, ''])}
        >
          Add {label.toLowerCase().replace(/s$/, '')}
        </Button>
      </div>
    </Stack>
  );
}

/**
 * One entity of the data model: its name, the node that owns it, what
 * identifies it, its fields, the invariants it holds and the states it
 * moves through. Every slot but the name is optional to the schema; the
 * model critic grades what is missing.
 */
export function ModelEntityRow({
  entity,
  graph,
  disabled,
  onChange,
  onRemove,
}: ModelEntityRowProps) {
  const field = (name: string) => `model-entity-${entity.id}-${name}`;
  return (
    <Surface
      as="section"
      padding={4}
      role="group"
      aria-label={entity.name.trim().length > 0 ? entity.name : `Entity ${entity.id}`}
      data-testid={`model-entity-${entity.id}`}
    >
      <Stack gap={3}>
        <Stack direction="row" gap={2} align="center" wrap>
          <Badge tone="accent">{entity.id}</Badge>
        </Stack>
        <TextField
          label="Entity"
          data-testid={field('name')}
          value={entity.name}
          maxLength={ENTITY_NAME_BOUND.ceiling}
          target={ENTITY_NAME_BOUND.target}
          placeholder="e.g. Order"
          disabled={disabled}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <SelectField
          label="Owned by"
          data-testid={field('owner')}
          value={entity.ownerNodeId ?? ''}
          disabled={disabled}
          onChange={(event) => onChange({ ownerNodeId: event.target.value })}
        >
          <option value="">No owner yet</option>
          {graph.nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.label} · {node.kind}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Key"
          data-testid={field('key')}
          value={entity.key ?? ''}
          maxLength={ENTITY_NOTE_BOUND.ceiling}
          target={ENTITY_NOTE_BOUND.target}
          placeholder="What identifies one instance"
          disabled={disabled}
          onChange={(event) => onChange({ key: event.target.value })}
        />
        <Stack gap={1} role="group" aria-label="Fields">
          <Text as="span" size="sm" tone="secondary">
            Fields
          </Text>
          {entity.fields.map((item, index) => (
            <Stack
              // Fields have no id of their own: positional rows, re-keyed on removal.
              // eslint-disable-next-line @eslint-react/no-array-index-key
              key={index}
              direction="row"
              gap={2}
              align="end"
              wrap
            >
              <TextField
                label={`Field ${index + 1}`}
                data-testid={field(`field-${index}-name`)}
                value={item.name}
                maxLength={ENTITY_NAME_BOUND.ceiling}
                target={ENTITY_NAME_BOUND.target}
                placeholder="name"
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    fields: entity.fields.map((f, at) =>
                      at === index ? { ...f, name: event.target.value } : f,
                    ),
                  })
                }
              />
              <TextField
                label={`Field ${index + 1} note`}
                data-testid={field(`field-${index}-note`)}
                value={item.note ?? ''}
                maxLength={ENTITY_NOTE_BOUND.ceiling}
                target={ENTITY_NOTE_BOUND.target}
                placeholder="type, meaning or rule"
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    fields: entity.fields.map((f, at) =>
                      at === index
                        ? event.target.value.trim().length === 0
                          ? { name: f.name }
                          : { ...f, note: event.target.value }
                        : f,
                    ),
                  })
                }
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                data-testid={field(`field-${index}-remove`)}
                onClick={() => onChange({ fields: entity.fields.filter((_, at) => at !== index) })}
              >
                Remove
              </Button>
            </Stack>
          ))}
          <div>
            <Button
              size="sm"
              variant="subtle"
              disabled={disabled || entity.fields.length >= ENTITY_FIELDS_BOUND.target}
              data-testid={field('field-add')}
              onClick={() => onChange({ fields: [...entity.fields, { name: '' }] })}
            >
              Add field
            </Button>
          </div>
        </Stack>
        <TextList
          label="Invariants"
          items={entity.invariants}
          bound={ENTITY_NOTE_BOUND}
          max={ENTITY_INVARIANTS_BOUND.target}
          testId={field('invariant')}
          placeholder="A rule every instance must satisfy"
          disabled={disabled}
          onChange={(invariants) => onChange({ invariants })}
        />
        <TextList
          label="States"
          items={entity.states}
          bound={ENTITY_NAME_BOUND}
          max={ENTITY_STATES_BOUND.target}
          testId={field('state')}
          placeholder="A lifecycle state, in order"
          disabled={disabled}
          onChange={(states) => onChange({ states })}
        />
        <div>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            data-testid={field('remove')}
            onClick={onRemove}
          >
            Remove entity
          </Button>
        </div>
      </Stack>
    </Surface>
  );
}
