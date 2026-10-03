import { useEffect, useRef, type ReactNode } from 'react';

// After client-side navigation the browser does not move focus. Focusing the page heading
// tells keyboard and screen-reader users that a new page is shown (tabIndex -1 = focusable by code only).
export default function PageHeading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return <h1 ref={ref} tabIndex={-1}>{children}</h1>;
}
