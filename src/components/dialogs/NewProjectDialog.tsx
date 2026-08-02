import { useState } from 'react';
import type { Unit } from '@/types';
import { createProject } from '@/state/project';
import { formatArea } from '@/core/units';
import { toMM } from '@/core/units';
import { Button, Dialog, Field, NumberInput, Segmented, Switch, TextInput } from '../ui';

const PRESETS: Array<{ name: string; w: number; h: number; unit: Unit }> = [
  { name: 'Studio', w: 20, h: 24, unit: 'ft' },
  { name: '1 BHK', w: 30, h: 24, unit: 'ft' },
  { name: '2 BHK', w: 40, h: 30, unit: 'ft' },
  { name: '3 BHK', w: 50, h: 40, unit: 'ft' },
  { name: 'Small home', w: 9, h: 8, unit: 'm' },
  { name: 'Family home', w: 14, h: 11, unit: 'm' },
  { name: 'Large villa', w: 20, h: 16, unit: 'm' },
  { name: 'Site 200×200', w: 200, h: 200, unit: 'ft' },
];

export function NewProjectDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (project: ReturnType<typeof createProject>) => void;
}) {
  const [name, setName] = useState('Untitled Plan');
  const [unit, setUnit] = useState<Unit>('ft');
  const [width, setWidth] = useState(40);
  const [height, setHeight] = useState(30);
  const [outerWalls, setOuterWalls] = useState(true);

  const areaMM2 = toMM(width, unit) * toMM(height, unit);
  const valid = width > 0 && height > 0;

  const submit = () => {
    if (!valid) return;
    onCreate(createProject({ name, width, height, unit, outerWalls }));
  };

  return (
    <Dialog
      title="New floor plan"
      subtitle="Set the footprint — exterior walls, grid, rulers and the first room are generated for you."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={submit}>
            Create plan
          </Button>
        </>
      }
    >
      <Field label="Name">
        <TextInput value={name} onCommit={setName} placeholder="e.g. Riverside Apartment" />
      </Field>

      <Field label="Units">
        <Segmented
          label="Units"
          value={unit}
          onChange={(u) => {
            // Convert the typed dimensions so the footprint stays the same size.
            const factorFrom = toMM(1, unit);
            const factorTo = toMM(1, u);
            setWidth(round((width * factorFrom) / factorTo));
            setHeight(round((height * factorFrom) / factorTo));
            setUnit(u);
          }}
          options={[
            { value: 'ft', label: 'Feet' },
            { value: 'in', label: 'Inches' },
            { value: 'm', label: 'Metres' },
            { value: 'cm', label: 'cm' },
          ]}
        />
      </Field>

      <div className="grid2">
        <Field label="Width" stack>
          <NumberInput value={width} min={1} step={1} suffix={unit} onCommit={setWidth} />
        </Field>
        <Field label="Depth" stack>
          <NumberInput value={height} min={1} step={1} suffix={unit} onCommit={setHeight} />
        </Field>
      </div>

      <p className="note" style={{ marginBottom: 16 }}>
        Internal floor area {formatArea(areaMM2, unit)}. Dimensions are the clear inside face of the
        exterior walls, so the generated room reports exactly this number.
      </p>

      <Switch
        label="Generate exterior walls automatically"
        checked={outerWalls}
        onChange={setOuterWalls}
      />

      <h3 className="panel__title" style={{ marginTop: 20 }}>
        Start from a preset
      </h3>
      <div className="grid2">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            className="preset"
            onClick={() => {
              setWidth(p.w);
              setHeight(p.h);
              setUnit(p.unit);
            }}
          >
            <div className="preset__name">{p.name}</div>
            <div className="preset__dim">
              {p.w} × {p.h} {p.unit}
            </div>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
