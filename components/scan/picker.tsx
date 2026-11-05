"use client";

import { Button } from "@/components/ui";
import { compressImage } from "@/lib/utils";
import { Camera, Images, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface PickedImage {
  id: string;
  dataUrl: string;
  blob: Blob;
}

/**
 * Screenshot picker. Zero-typing happy path: tap once → photo library →
 * pick one or many → the scan starts by itself (`onAutoScan`).
 * Also accepts pasted (Ctrl/Cmd+V) and dropped images.
 */
export function ImagePicker({
  images,
  onChange,
  onScan,
  onAutoScan,
  onManual,
  max = 6,
}: {
  images: PickedImage[];
  onChange: (imgs: PickedImage[]) => void;
  onScan: () => void;
  /** Called with the full list right after new images were added. */
  onAutoScan?: (imgs: PickedImage[]) => void;
  onManual: () => void;
  max?: number;
}) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  async function addFiles(files: FileList | File[] | null, auto = true) {
    const list = files ? Array.from(files).filter((f) => f.type.startsWith("image/")) : [];
    if (!list.length) return;
    setBusy(true);
    try {
      const next = [...imagesRef.current];
      for (const f of list.slice(0, Math.max(0, max - next.length))) {
        const { dataUrl, blob } = await compressImage(f);
        next.push({ id: crypto.randomUUID(), dataUrl, blob });
      }
      onChange(next);
      if (auto && next.length) onAutoScan?.(next);
    } finally {
      setBusy(false);
      if (galleryRef.current) galleryRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  // Paste screenshots straight from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(true);
    },
    onDragLeave: () => setDrag(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      void addFiles(e.dataTransfer.files);
    },
  };

  return (
    <div className="px-5 space-y-4 anim-rise" {...dropProps}>
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} data-testid="gallery-input" />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addFiles(e.target.files)} data-testid="camera-input" />

      {images.length === 0 ? (
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={busy}
          className={`w-full rounded-3xl border-2 border-dashed bg-card active:scale-[0.99] transition p-8 text-center ${drag ? "border-brand bg-brand-soft" : "border-line hover:bg-card-2"}`}
        >
          <div className="mx-auto size-20 rounded-3xl bg-brand text-brand-ink grid place-items-center shadow-[0_10px_30px_-10px_var(--brand)]">
            <Images className="size-9" />
          </div>
          <div className="mt-5 font-bold text-xl">Tap to choose screenshots</div>
          <p className="text-sm text-ink-3 mt-1.5 leading-relaxed">
            Pick the payment app screenshot and the Touch &rsquo;n Go / Wise one together.
            <br />
            We&rsquo;ll read them and fill everything in.
          </p>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, i) => (
            <div key={img.id} className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-card-2 anim-pop">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.dataUrl} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(images.filter((x) => x.id !== img.id))}
                className="absolute top-1.5 right-1.5 size-7 rounded-full bg-black/60 text-white grid place-items-center"
                aria-label="Remove"
              >
                <X className="size-4" />
              </button>
              <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold bg-black/60 text-white rounded-full px-1.5 py-0.5">{i + 1}</span>
            </div>
          ))}
          {images.length < max && (
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              disabled={busy}
              className="aspect-[3/4] rounded-2xl border-2 border-dashed border-line grid place-items-center text-ink-3 hover:bg-card-2"
              aria-label="Add more"
            >
              <Images className="size-6" />
            </button>
          )}
        </div>
      )}

      {images.length > 0 && (
        <Button size="lg" className="w-full" onClick={onScan} loading={busy}>
          <Sparkles className="size-5" /> Scan {images.length > 1 ? `${images.length} screenshots` : "screenshot"}
        </Button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => galleryRef.current?.click()} disabled={busy || images.length >= max}>
          <Images className="size-4" /> Photo library
        </Button>
        <Button variant="secondary" onClick={() => cameraRef.current?.click()} disabled={busy || images.length >= max}>
          <Camera className="size-4" /> Camera
        </Button>
      </div>

      <button type="button" onClick={onManual} className="w-full text-sm text-ink-3 underline underline-offset-4 py-1">
        No screenshot — type it manually
      </button>
      <p className="text-center text-[11px] text-ink-3">Tip: you can also paste screenshots here.</p>
    </div>
  );
}
