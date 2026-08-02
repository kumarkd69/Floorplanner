import type { Project, Unit } from '@/types';
import { store, useStoreState } from '@/hooks/useStore';
import { formatArea, fromMM, toMM } from '@/core/units';
import { projectBounds } from '@/core/entities';
import { Button, Dialog, Field, NumberInput, Segmented, TextInput } from '../ui';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const project = useStoreState((s) => s.project);
  const bounds = projectBounds(project);

  const setMeta = (patch: Partial<Project>) => store.setProjectMeta(patch);
  const setTitle = (patch: Partial<Project['titleBlock']>) =>
    store.setProjectMeta({ titleBlock: { ...project.titleBlock, ...patch } });

  return (
    <Dialog
      title="Project settings"
      subtitle="Units, drawing defaults and the title block that appears on every export."
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <h3 className="panel__title">Drawing</h3>
      <Field label="Name">
        <TextInput value={project.name} onCommit={(name) => setMeta({ name })} />
      </Field>
      <Field label="Units">
        <Segmented
          label="Display units"
          value={project.unit}
          onChange={(unit: Unit) => setMeta({ unit })}
          options={[
            { value: 'ft', label: 'Feet' },
            { value: 'in', label: 'Inches' },
            { value: 'm', label: 'Metres' },
            { value: 'cm', label: 'cm' },
          ]}
        />
      </Field>
      <p className="note" style={{ margin: '4px 0 16px' }}>
        Geometry is always stored in millimetres, so switching units only changes what you read —
        nothing moves and nothing is rounded away.
      </p>
      <Field label="Grid">
        <NumberInput
          value={round(fromMM(project.gridSize, project.unit))}
          min={0.01}
          step={project.unit === 'ft' ? 0.5 : 0.1}
          suffix={project.unit}
          onCommit={(v) => setMeta({ gridSize: toMM(v, project.unit) })}
        />
      </Field>

      <h3 className="panel__title" style={{ marginTop: 20 }}>
        Title block
      </h3>
      <Field label="Project">
        <TextInput
          value={project.titleBlock.projectName}
          onCommit={(projectName) => setTitle({ projectName })}
        />
      </Field>
      <Field label="Client">
        <TextInput value={project.titleBlock.client} onCommit={(client) => setTitle({ client })} />
      </Field>
      <Field label="Drawn by">
        <TextInput value={project.titleBlock.drawnBy} onCommit={(drawnBy) => setTitle({ drawnBy })} />
      </Field>
      <Field label="Sheet no.">
        <TextInput value={project.titleBlock.sheet} onCommit={(sheet) => setTitle({ sheet })} />
      </Field>
      <Field label="Date">
        <TextInput value={project.titleBlock.date} onCommit={(date) => setTitle({ date })} />
      </Field>
      <Field label="Notes" stack>
        <TextInput value={project.titleBlock.notes} onCommit={(notes) => setTitle({ notes })} />
      </Field>

      <h3 className="panel__title" style={{ marginTop: 20 }}>
        Extents
      </h3>
      <p className="note">
        {bounds
          ? `Drawing covers ${formatArea(bounds.w * bounds.h, project.unit)} of sheet area, ${project.order.length} objects across ${project.layers.length} layers.`
          : 'Nothing drawn yet.'}
      </p>
    </Dialog>
  );
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
