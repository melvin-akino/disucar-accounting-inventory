"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface AttachmentItem {
  id: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  uploadedAt: string;
  uploadedBy?: { name: string } | null;
}

interface Props {
  entityType: string;
  entityId: string;
  attachments: AttachmentItem[];
  canUpload?: boolean;
  canDelete?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mime: string): string {
  if (mime.startsWith("image/")) return "🖼";
  if (mime === "application/pdf") return "📄";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "📊";
  if (mime.includes("word")) return "📝";
  return "📎";
}

export function Attachments({ entityType, entityId, attachments: initial, canUpload = true, canDelete = false }: Props) {
  const router = useRouter();
  const [attachments, setAttachments] = useState<AttachmentItem[]>(initial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entityType", entityType);
      fd.append("entityId", entityId);

      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) { setError(data.error ?? "Upload failed"); continue; }
      setAttachments(prev => [...prev, data]);
    }

    setUploading(false);
    router.refresh();
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    upload(e.dataTransfer.files);
  }, [entityType, entityId]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this attachment?")) return;
    const res = await fetch("/api/attachments/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setAttachments(prev => prev.filter(a => a.id !== id));
      router.refresh();
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Attachments ({attachments.length})</span>
        {canUpload && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn btn-sm"
            >
              {uploading ? "Uploading…" : "+ Attach file"}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              style={{ display: "none" }}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.xlsx,.xls,.docx,.doc"
              onChange={e => upload(e.target.files)}
            />
          </>
        )}
      </div>

      {error && (
        <div style={{ padding: "6px 10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 5, fontSize: 12, color: "#dc2626", marginBottom: 8 }}>
          {error}
        </div>
      )}

      {canUpload && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragOver ? "oklch(var(--accent))" : "oklch(var(--line))"}`,
            borderRadius: 7, padding: "12px 16px", marginBottom: 10,
            background: dragOver ? "oklch(var(--bg-2))" : "transparent",
            fontSize: 12, color: "oklch(var(--ink-3))", textAlign: "center",
            transition: "all 0.15s",
          }}
        >
          Drop files here or click "Attach file" · PDF, images, Excel, Word · Max 10 MB
        </div>
      )}

      {attachments.length === 0 ? (
        <div style={{ fontSize: 12, color: "oklch(var(--ink-3))", padding: "8px 0" }}>No attachments yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {attachments.map(a => (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", borderRadius: 7,
              border: "1px solid oklch(var(--line))",
              background: "oklch(var(--bg-2))",
            }}>
              <span style={{ fontSize: 18 }}>{fileIcon(a.mimeType)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, fontWeight: 500, color: "oklch(var(--accent))", textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {a.originalName}
                </a>
                <span style={{ fontSize: 11, color: "oklch(var(--ink-3))" }}>
                  {formatSize(a.fileSize)} · {new Date(a.uploadedAt).toLocaleDateString("en-PH")}
                  {a.uploadedBy && ` · ${a.uploadedBy.name}`}
                </span>
              </div>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  className="btn btn-ghost btn-sm btn-danger"
                  style={{ flexShrink: 0 }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
