import { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '../store/appStore';

interface ScreenshotPickerProps {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

interface ScreenSource {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
}

interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export default function ScreenshotPicker({ onCapture, onClose }: ScreenshotPickerProps) {
  const [screens, setScreens] = useState<ScreenSource[]>([]);
  const [selectedScreen, setSelectedScreen] = useState<ScreenSource | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const pushLog = useApp((s) => s.pushLog);

  // Load available screens on mount
  useEffect(() => {
    const loadScreens = async () => {
      try {
        setIsLoading(true);
        const sources = await window.api.screenshot.captureAllScreens();
        setScreens(sources);
        if (sources.length > 0) {
          setSelectedScreen(sources[0]);
        }
        setError(null);
      } catch (e) {
        setError((e as Error).message);
        pushLog('error', `Failed to capture screens: ${(e as Error).message}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadScreens();
  }, [pushLog]);

  // Draw the selected screen on canvas
  useEffect(() => {
    if (!selectedScreen || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Scale to fit container while maintaining aspect ratio
      const container = containerRef.current;
      if (!container) return;

      const maxWidth = container.clientWidth - 40;
      const maxHeight = container.clientHeight - 200;
      
      const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
      
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = selectedScreen.dataUrl;
  }, [selectedScreen]);

  // Draw selection overlay
  useEffect(() => {
    if (!selection || !canvasRef.current || !selectedScreen) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Redraw the image first
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw semi-transparent overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Clear the selected region
      const x = Math.min(selection.startX, selection.endX);
      const y = Math.min(selection.startY, selection.endY);
      const w = Math.abs(selection.endX - selection.startX);
      const h = Math.abs(selection.endY - selection.startY);

      // Draw the selected region without overlay
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Draw selection border
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      // Draw size indicator
      if (w > 50 && h > 20) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
        ctx.fillRect(x, y - 24, Math.min(100, w), 20);
        ctx.fillStyle = 'white';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${Math.round(w)} × ${Math.round(h)}`, x + 4, y - 8);
      }
    };
    img.src = selectedScreen.dataUrl;
  }, [selection, selectedScreen]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsSelecting(true);
    setSelection({ startX: x, startY: y, endX: x, endY: y });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting || !selection) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvas.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(canvas.height, e.clientY - rect.top));

    setSelection((prev) => prev ? { ...prev, endX: x, endY: y } : null);
  }, [isSelecting, selection]);

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false);
  }, []);

  const captureSelection = async () => {
    if (!selection || !selectedScreen || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const scaleX = selectedScreen.width / canvas.width;
    const scaleY = selectedScreen.height / canvas.height;

    const x = Math.min(selection.startX, selection.endX) * scaleX;
    const y = Math.min(selection.startY, selection.endY) * scaleY;
    const w = Math.abs(selection.endX - selection.startX) * scaleX;
    const h = Math.abs(selection.endY - selection.startY) * scaleY;

    if (w < 10 || h < 10) {
      pushLog('warn', 'Selection too small. Please select a larger region.');
      return;
    }

    try {
      const dataUrl = await window.api.screenshot.captureRegion(
        Math.round(x),
        Math.round(y),
        Math.round(w),
        Math.round(h),
      );
      onCapture(dataUrl);
      pushLog('info', 'Screenshot captured successfully');
    } catch (e) {
      pushLog('error', `Failed to capture region: ${(e as Error).message}`);
    }
  };

  const captureFullScreen = async () => {
    try {
      const dataUrl = await window.api.screenshot.captureFullScreen();
      onCapture(dataUrl);
      pushLog('info', 'Full screen captured successfully');
    } catch (e) {
      pushLog('error', `Failed to capture full screen: ${(e as Error).message}`);
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && selection) {
        captureSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selection]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-soft bg-bg-elevated px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">Screenshot Capture</h2>
          <p className="text-[11px] text-fg-muted">
            Click and drag to select a region, or capture the full screen
          </p>
        </div>
        <div className="flex items-center gap-2">
          {screens.length > 1 && (
            <select
              value={selectedScreen?.id || ''}
              onChange={(e) => {
                const screen = screens.find((s) => s.id === e.target.value);
                if (screen) {
                  setSelectedScreen(screen);
                  setSelection(null);
                }
              }}
              className="rounded border border-border bg-bg px-2 py-1 text-xs text-fg"
            >
              {screens.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={captureFullScreen}
            className="rounded border border-border px-3 py-1.5 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
          >
            Capture Full Screen
          </button>
          <button
            onClick={captureSelection}
            disabled={!selection}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            Capture Selection
          </button>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-fg-muted hover:bg-bg-hover hover:text-fg"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
        {isLoading ? (
          <div className="text-sm text-fg-muted">Capturing screens...</div>
        ) : error ? (
          <div className="text-sm text-danger">{error}</div>
        ) : (
          <canvas
            ref={canvasRef}
            className="cursor-crosshair rounded border border-border-soft shadow-lg"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        )}
      </div>

      {/* Footer hints */}
      <div className="border-t border-border-soft bg-bg-elevated px-4 py-2">
        <div className="flex items-center justify-center gap-4 text-[11px] text-fg-subtle">
          <span><kbd className="rounded bg-bg px-1.5 py-0.5 font-mono">Esc</kbd> Cancel</span>
          <span><kbd className="rounded bg-bg px-1.5 py-0.5 font-mono">Enter</kbd> Capture selection</span>
          <span>Click and drag to select region</span>
        </div>
      </div>
    </div>
  );
}
