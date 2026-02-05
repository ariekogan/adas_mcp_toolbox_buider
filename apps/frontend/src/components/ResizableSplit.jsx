/**
 * ResizableSplit — Draggable divider between two panels
 *
 * Renders left and right children with a drag handle between them.
 * No external dependencies.
 */

import { useState, useEffect, useRef } from 'react';

export default function ResizableSplit({
  left,
  right,
  initialLeftPercent = 50,
  minLeftPercent = 25,
  maxLeftPercent = 75,
}) {
  const containerRef = useRef(null);
  const [leftPercent, setLeftPercent] = useState(initialLeftPercent);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e) => {
      const rect = containerRef.current.getBoundingClientRect();
      let pct = ((e.clientX - rect.left) / rect.width) * 100;
      pct = Math.max(minLeftPercent, Math.min(maxLeftPercent, pct));
      setLeftPercent(pct);
    };

    const onUp = () => setIsDragging(false);

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, minLeftPercent, maxLeftPercent]);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
      }}
    >
      {/* Left panel */}
      <div style={{
        flex: `0 0 ${leftPercent}%`,
        overflow: 'hidden',
        display: 'flex',
      }}>
        {left}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        style={{
          width: '6px',
          cursor: 'col-resize',
          flexShrink: 0,
          background: isDragging ? 'var(--accent)' : 'var(--border)',
          transition: isDragging ? 'none' : 'background 0.2s',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Grip dots */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
        }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: '3px',
              height: '3px',
              borderRadius: '50%',
              background: isDragging ? 'white' : 'var(--text-muted)',
              transition: 'background 0.2s',
            }} />
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
      }}>
        {right}
      </div>
    </div>
  );
}
