import { useEffect, useState } from 'react';

export function useCompact(breakpoint = 900) {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth < breakpoint);
  useEffect(() => {
    const on = () => setCompact(window.innerWidth < breakpoint);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [breakpoint]);
  return compact;
}
