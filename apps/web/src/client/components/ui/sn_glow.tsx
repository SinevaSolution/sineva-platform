import type * as React from 'react';

/**
 * Soft light around the main "Ask Sino" inputs: a slowly turning gradient
 * ring on the edge and a blurred aurora behind, brighter while the input has
 * focus. The effect lives on this wrapper (styles in globals.css, `.sn-glow`)
 * so the aurora sits behind the child's own background and never covers its
 * text. `radius` must match the child's corner radius.
 */
export function SNGlow({
  radius,
  className,
  style,
  children,
}: {
  radius: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={className ? `sn-glow ${className}` : 'sn-glow'}
      style={{ ...style, '--sn-glow-radius': radius } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
