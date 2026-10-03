import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { api } from '../api';
import { messageOf } from '../api/errors';
import type { Attachment } from '../types';

const formatSize = (bytes: number | null): string =>
  bytes == null ? '' : bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

export default function Attachments({ taskId }: { taskId: string }) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const files$ = api.attachments; // null in Express mode; TaskItem only renders us when it exists

  const load = useCallback(async () => {
    if (!files$) return;
    try { setFiles(await files$.list(taskId)); setError(''); } catch (err) { setError(messageOf(err)); }
  }, [files$, taskId]);
  useEffect(() => { void load(); }, [load]);

  if (!files$) return null;

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !files$) return;
    setBusy(true);
    try { await files$.upload(taskId, file); await load(); } catch (err) { setError(messageOf(err)); }
    setBusy(false);
    if (input.current) input.current.value = ''; // allow choosing the same file again
  }

  async function open(path: string) {
    try { window.open(await files$!.openUrl(path), '_blank', 'noopener'); } catch (err) { setError(messageOf(err)); }
  }

  async function remove(path: string) {
    try { await files$!.remove(path); await load(); } catch (err) { setError(messageOf(err)); }
  }

  return (
    <div className="attachments">
      <label className="upload">
        {busy ? 'Uploading…' : '+ Add file (max 5 MB)'}
        <input ref={input} type="file" aria-label="Upload attachment" disabled={busy} onChange={(e) => { void upload(e); }} hidden />
      </label>
      {error && <p className="error small">{error}</p>}
      <ul>
        {files.map((f) => (
          <li key={f.path} className="row between">
            <button className="link small" onClick={() => { void open(f.path); }}>{f.name}</button>
            <span className="muted small">{formatSize(f.size)}</span>
            <button className="icon" aria-label={`Delete ${f.name}`} onClick={() => { void remove(f.path); }}>✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
