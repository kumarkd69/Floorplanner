import { useEffect, useRef, useState } from 'react';
import type { Project, UIState } from '@/types';
import {
  DEFAULT_EXPORT,
  exportDXF,
  exportJSON,
  exportPDF,
  exportPNG,
  exportSVG,
  renderToCanvas,
  type ExportFormat,
  type ExportOptions,
} from '@/export';
import { Button, Dialog, Field, Segmented, Switch, TextInput } from '../ui';
import { store } from '@/hooks/useStore';

const FORMATS: Array<{ id: ExportFormat; label: string; blurb: string }> = [
  { id: 'png', label: 'PNG', blurb: 'High-resolution raster for presentations and messaging.' },
  { id: 'pdf', label: 'PDF', blurb: 'Print-ready sheet via your browser’s “Save as PDF”.' },
  { id: 'svg', label: 'SVG', blurb: 'True-scale vector in millimetres, editable in Illustrator.' },
  { id: 'dxf', label: 'DXF', blurb: 'AutoCAD R12 with layered walls, openings and text.' },
  { id: 'json', label: 'JSON', blurb: 'The full editable project — reopen it here later.' },
];

const PAPER: Array<{ label: string; w: number; h: number }> = [
  { label: 'A4 landscape', w: 1587, h: 1123 },
  { label: 'A3 landscape', w: 2245, h: 1587 },
  { label: 'A3 portrait', w: 1587, h: 2245 },
  { label: 'Widescreen', w: 1920, h: 1080 },
  { label: 'Square', w: 1600, h: 1600 },
];

export function ExportDialog({
  project,
  ui,
  onClose,
}: {
  project: Project;
  ui: UIState;
  onClose: () => void;
}) {
  const [opts, setOpts] = useState<ExportOptions>(DEFAULT_EXPORT);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const set = (patch: Partial<ExportOptions>) => setOpts((o) => ({ ...o, ...patch }));

  // Live preview so the title block and framing are never a surprise.
  useEffect(() => {
    if (opts.format === 'json' || opts.format === 'dxf') return;
    const target = previewRef.current;
    if (!target) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (cancelled) return;
      try {
        const source = renderToCanvas(project, ui, { ...opts, resolution: 1 });
        const ctx = target.getContext('2d');
        if (!ctx) return;
        const scale = Math.min(target.width / source.width, target.height / source.height);
        const w = source.width * scale;
        const h = source.height * scale;
        ctx.clearRect(0, 0, target.width, target.height);
        ctx.drawImage(source, (target.width - w) / 2, (target.height - h) / 2, w, h);
      } catch {
        // A preview failure must never block the actual export.
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [project, ui, opts]);

  const run = async () => {
    setBusy(true);
    try {
      switch (opts.format) {
        case 'json':
          exportJSON(project);
          break;
        case 'png':
          await exportPNG(project, ui, opts);
          break;
        case 'svg':
          exportSVG(project, ui, opts);
          break;
        case 'dxf':
          exportDXF(project);
          break;
        case 'pdf':
          exportPDF(project, ui, opts);
          break;
      }
      onClose();
    } catch (err) {
      window.alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const format = FORMATS.find((f) => f.id === opts.format)!;
  const raster = opts.format === 'png' || opts.format === 'pdf' || opts.format === 'svg';

  return (
    <Dialog
      title="Export"
      subtitle={format.blurb}
      wide
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={run}>
            {busy ? 'Exporting…' : `Export ${format.label}`}
          </Button>
        </>
      }
    >
      <div className="grid2" style={{ gap: 16, alignItems: 'start' }}>
        <div>
          <h3 className="panel__title">Format</h3>
          <div className="vstack" style={{ marginBottom: 16 }}>
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                className="preset"
                style={
                  opts.format === f.id
                    ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
                    : undefined
                }
                onClick={() => set({ format: f.id })}
              >
                <div className="preset__name">{f.label}</div>
                <div className="preset__dim">{f.blurb}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          {raster && (
            <>
              <h3 className="panel__title">Sheet</h3>
              <Field label="Size">
                <select
                  className="select"
                  value={`${opts.width}x${opts.height}`}
                  onChange={(e) => {
                    const [w, h] = e.target.value.split('x').map(Number);
                    set({ width: w, height: h });
                  }}
                >
                  {PAPER.map((p) => (
                    <option key={p.label} value={`${p.w}x${p.h}`}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              {opts.format === 'png' && (
                <Field label="Resolution">
                  <Segmented
                    label="Resolution"
                    value={String(opts.resolution)}
                    onChange={(v) => set({ resolution: Number(v) })}
                    options={[
                      { value: '1', label: '1× · 96dpi' },
                      { value: '2', label: '2× · 192dpi' },
                      { value: '4', label: '4× · print' },
                    ]}
                  />
                </Field>
              )}
              <div style={{ marginTop: 12 }}>
                <Switch
                  label="Title block"
                  checked={opts.sheet.titleBlock}
                  onChange={(titleBlock) => set({ sheet: { ...opts.sheet, titleBlock } })}
                />
                <Switch
                  label="North arrow"
                  checked={opts.sheet.northArrow}
                  onChange={(northArrow) => set({ sheet: { ...opts.sheet, northArrow } })}
                />
                <Switch
                  label="Scale bar"
                  checked={opts.sheet.scaleBar}
                  onChange={(scaleBar) => set({ sheet: { ...opts.sheet, scaleBar } })}
                />
                <Switch
                  label="Room legend"
                  checked={opts.sheet.legend}
                  onChange={(legend) => set({ sheet: { ...opts.sheet, legend } })}
                />
                <Switch
                  label="Transparent background"
                  checked={opts.transparent}
                  onChange={(transparent) => set({ transparent })}
                />
              </div>
            </>
          )}

          <h3 className="panel__title" style={{ marginTop: 16 }}>
            Title block
          </h3>
          <Field label="Client">
            <TextInput
              value={project.titleBlock.client}
              onCommit={(client) =>
                store.setProjectMeta({ titleBlock: { ...project.titleBlock, client } })
              }
            />
          </Field>
          <Field label="Drawn by">
            <TextInput
              value={project.titleBlock.drawnBy}
              onCommit={(drawnBy) =>
                store.setProjectMeta({ titleBlock: { ...project.titleBlock, drawnBy } })
              }
            />
          </Field>
          <Field label="Sheet">
            <TextInput
              value={project.titleBlock.sheet}
              onCommit={(sheet) =>
                store.setProjectMeta({ titleBlock: { ...project.titleBlock, sheet } })
              }
            />
          </Field>
          <Field label="Date">
            <TextInput
              value={project.titleBlock.date}
              onCommit={(date) => store.setProjectMeta({ titleBlock: { ...project.titleBlock, date } })}
            />
          </Field>
          <Field label="Notes" stack>
            <TextInput
              value={project.titleBlock.notes}
              onCommit={(notes) =>
                store.setProjectMeta({ titleBlock: { ...project.titleBlock, notes } })
              }
            />
          </Field>
        </div>
      </div>

      {opts.format !== 'json' && opts.format !== 'dxf' && (
        <>
          <h3 className="panel__title" style={{ marginTop: 8 }}>
            Preview
          </h3>
          <canvas
            ref={previewRef}
            width={576}
            height={320}
            style={{
              width: '100%',
              height: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              background: 'var(--bg-sunken)',
            }}
          />
        </>
      )}

      {opts.format === 'dxf' && (
        <p className="note">
          Walls export as closed outlines on <strong>A-WALL</strong> with centrelines on
          <strong> A-WALL-CNTR</strong>; doors, windows, furniture, rooms and annotations each get
          their own AIA-style layer. Units are millimetres.
        </p>
      )}
    </Dialog>
  );
}
